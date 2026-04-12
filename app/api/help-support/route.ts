import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { cloudinary } from '@/lib/cloudinary';
import { sendEmail } from '@/lib/email';
import { db } from '@/lib/db';
import { JWT_SECRET } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024;

type JWTPayload = {
  id: number;
  user_type: string;
  name?: string;
  email?: string;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export async function POST(request: NextRequest) {
  try {
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      return NextResponse.json({ error: 'Support upload service is not configured' }, { status: 503 });
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    const user = await db.users.findById(decoded.id);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const formData = await request.formData();
    const title = String(formData.get('title') || '').trim();
    const description = String(formData.get('description') || '').trim();
    const proof = formData.get('proof');

    if (title.length < 3) {
      return NextResponse.json({ error: 'Issue title is required' }, { status: 400 });
    }

    if (description.length < 10) {
      return NextResponse.json({ error: 'Issue description is required' }, { status: 400 });
    }

    if (!(proof instanceof File)) {
      return NextResponse.json({ error: 'Proof file is required' }, { status: 400 });
    }

    if (proof.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'Proof file is too large. Maximum size is 10MB.' }, { status: 413 });
    }

    if (!ALLOWED_MIME_TYPES.has(proof.type)) {
      return NextResponse.json({ error: 'Only images, PDF, DOC, and DOCX files are allowed as proof.' }, { status: 400 });
    }

    const bytes = await proof.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const isImage = proof.type.startsWith('image/');
    const uploadOptions: Record<string, any> = {
      resource_type: isImage ? 'image' : 'raw',
      folder: `support-tickets/${decoded.id}`,
      public_id: `ticket_${Date.now()}_${crypto.randomUUID()}`,
      overwrite: false,
    };

    if (isImage) {
      uploadOptions.transformation = [
        { width: 1600, height: 1600, crop: 'limit' },
        { quality: 'auto' },
        { format: 'auto' },
      ];
    }

    const uploaded = await new Promise<any>((resolve, reject) => {
      cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      }).end(buffer);
    });

    const ticketId = `SUP-${Date.now()}`;
    const adminEmail = process.env.SUPPORT_EMAIL || process.env.EMAIL_REPLY_TO || process.env.SMTP_FROM || process.env.SMTP_USER;

    const ticketRecord = await db.supportTickets.create({
      ticket_id: ticketId,
      user_id: decoded.id,
      user_name: user.name || decoded.name || null,
      user_email: user.email || decoded.email || null,
      user_type: decoded.user_type,
      title,
      description,
      proof_url: uploaded.secure_url,
      proof_public_id: uploaded.public_id,
      status: 'open',
      admin_notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await db.supportTicketMessages.create({
      ticket_id: ticketId,
      sender_id: decoded.id,
      sender_type: decoded.user_type,
      message_type: 'user_initial',
      content: description,
      attachment_url: uploaded.secure_url,
      attachment_public_id: uploaded.public_id,
      created_at: new Date().toISOString(),
    });

    let emailSent = false;
    if (adminEmail) {
      const ticketUrl = uploaded.secure_url as string;
      const ticketHtml = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
        <h2 style="margin: 0 0 12px; color: #1d4ed8;">New Support Ticket</h2>
        <p><strong>Ticket ID:</strong> ${escapeHtml(ticketId)}</p>
        <p><strong>Raised By:</strong> ${escapeHtml(user.name || decoded.name || 'Unknown')} (${escapeHtml(user.email || decoded.email || 'Unknown')})</p>
        <p><strong>User Type:</strong> ${escapeHtml(String(decoded.user_type))}</p>
        <p><strong>Title:</strong> ${escapeHtml(title)}</p>
        <p><strong>Description:</strong></p>
        <div style="white-space: pre-wrap; background: #f9fafb; border: 1px solid #e5e7eb; padding: 12px; border-radius: 8px;">${escapeHtml(description)}</div>
        <p style="margin-top: 16px;"><strong>Proof:</strong> <a href="${ticketUrl}" target="_blank" rel="noreferrer">Open uploaded proof</a></p>
      </div>
    `;

      const emailResult = await sendEmail({
        to: adminEmail,
        subject: `[Support] ${ticketId} - ${title}`,
        html: ticketHtml,
        text: `Ticket ID: ${ticketId}\nRaised By: ${user.name || decoded.name || 'Unknown'} (${user.email || decoded.email || 'Unknown'})\nUser Type: ${decoded.user_type}\nTitle: ${title}\nDescription: ${description}\nProof: ${ticketUrl}`,
        replyTo: user.email || decoded.email || undefined,
      });

      emailSent = emailResult.success;
    }

    return NextResponse.json({
      success: true,
      data: {
        ticketId,
        ticket: ticketRecord,
        proofUrl: uploaded.secure_url,
        message: 'Support ticket submitted successfully',
        emailSent,
      },
    });
  } catch (error: any) {
    console.error('Support ticket submission error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to submit support ticket' }, { status: 500 });
  }
}