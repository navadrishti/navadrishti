import { NextRequest, NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';
import { verifyToken } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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

export async function POST(request: NextRequest) {
  try {
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      return NextResponse.json(
        { error: 'Verification upload service is not configured' },
        { status: 503 }
      );
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const user = verifyToken(token);
    if (!user) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const documentKey = formData.get('documentKey');
    const category = formData.get('category');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum size is 10MB.' }, { status: 413 });
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: 'Only image files (JPG, PNG, GIF, WebP) and documents (PDF, DOC, DOCX) are allowed.' },
        { status: 400 }
      );
    }

    const safeCategory = typeof category === 'string' && category.trim() ? category.trim() : 'general';
    const safeDocumentKey = typeof documentKey === 'string' && documentKey.trim() ? documentKey.trim() : 'document';

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const isImage = file.type.startsWith('image/');
    const uploadOptions: Record<string, any> = {
      resource_type: isImage ? 'image' : 'raw',
      folder: `verification/${safeCategory}/${user.id}`,
      public_id: `${safeDocumentKey}_${Date.now()}_${crypto.randomUUID()}`,
      overwrite: false,
    };

    if (isImage) {
      uploadOptions.transformation = [
        { width: 1600, height: 1600, crop: 'limit' },
        { quality: 'auto' },
        { format: 'auto' },
      ];
    }

    const uploadResult = await new Promise<any>((resolve, reject) => {
      cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      }).end(buffer);
    });

    return NextResponse.json({
      success: true,
      data: {
        url: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        resourceType: uploadResult.resource_type,
        documentKey: safeDocumentKey,
      },
    });
  } catch (error) {
    console.error('Verification document upload error:', error);

    const cloudinaryError = error as {
      message?: string;
      http_code?: number;
      name?: string;
    };

    const errorMessage =
      typeof cloudinaryError?.message === 'string' && cloudinaryError.message.trim().length > 0
        ? cloudinaryError.message
        : 'Failed to upload verification document';

    const statusCode =
      typeof cloudinaryError?.http_code === 'number' && cloudinaryError.http_code >= 400 && cloudinaryError.http_code < 600
        ? cloudinaryError.http_code
        : 500;

    const userSafeError = errorMessage.toLowerCase().includes('api key') || errorMessage.toLowerCase().includes('api secret')
      ? 'Verification upload service authentication failed'
      : errorMessage;

    return NextResponse.json(
      {
        error: userSafeError,
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      },
      { status: statusCode }
    );
  }
}