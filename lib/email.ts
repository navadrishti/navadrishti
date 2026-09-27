import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import { createServerClient } from '@/lib/db';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);

const createTransporter = () => {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

export async function sendEmail({ to, subject, html, text, replyTo }: EmailOptions) {
  const transporter = createTransporter();

  if (!transporter) {
    return { success: false, message: 'Email service not configured' };
  }

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      html,
      text: text || '',
      replyTo: replyTo || process.env.SMTP_REPLY_TO || process.env.EMAIL_REPLY_TO,
    });

    return { success: true };
  } catch (error) {
    console.error('Error sending email:', error);
    return { success: false, error };
  }
}

const EMAIL_OTP_PREPARE_RATE_LIMIT_MS = 60 * 1000;
const prepareRateLimitStore = new Map<string, number>();

export const normalizeEmailAddress = (value: string) => value.trim().toLowerCase();

const isAlreadyRegisteredSupabaseAuthError = (error: {
  message?: string;
  code?: string | number | null;
}) => {
  const code = String(error.code || '').toLowerCase();
  const normalized = String(error.message || '').toLowerCase();
  return (
    code === 'email_exists' ||
    normalized.includes('already exists') ||
    normalized.includes('already registered') ||
    normalized.includes('already been registered') ||
    normalized.includes('duplicate') ||
    normalized.includes('user already registered') ||
    (normalized.includes('already') && normalized.includes('registered'))
  );
};

const cleanupPrepareRateLimitStore = () => {
  const now = Date.now();
  for (const [email, timestamp] of prepareRateLimitStore.entries()) {
    if (now - timestamp > EMAIL_OTP_PREPARE_RATE_LIMIT_MS * 2) {
      prepareRateLimitStore.delete(email);
    }
  }
};

export async function prepareEmailOtpSession(emailInput: string): Promise<
  | { ok: true }
  | { ok: false; status: number; error: string }
> {
  const email = normalizeEmailAddress(emailInput);
  cleanupPrepareRateLimitStore();

  const lastPreparedAt = prepareRateLimitStore.get(email);
  if (lastPreparedAt && Date.now() - lastPreparedAt < EMAIL_OTP_PREPARE_RATE_LIMIT_MS) {
    const retryAfterSeconds = Math.ceil(
      (EMAIL_OTP_PREPARE_RATE_LIMIT_MS - (Date.now() - lastPreparedAt)) / 1000
    );
    return {
      ok: false,
      status: 429,
      error: `Please wait ${retryAfterSeconds}s before requesting another email OTP`,
    };
  }

  const supabase = createServerClient();
  const { error } = await supabase.auth.admin.createUser({
    email,
    password: crypto.randomBytes(24).toString('base64url'),
    email_confirm: true,
  });

  if (error && !isAlreadyRegisteredSupabaseAuthError(error)) {
    console.error('Prepare email OTP error:', error);
    return { ok: false, status: 500, error: 'Failed to prepare email OTP session' };
  }

  prepareRateLimitStore.set(email, Date.now());
  return { ok: true };
}

export async function verifyEmailOtpWithSupabase(
  email: string,
  token: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );

  const otpTypes: Array<'email' | 'signup'> = ['email', 'signup'];
  let verificationError: Error | null = null;

  for (const otpType of otpTypes) {
    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: otpType,
    });

    if (!error) {
      return { ok: true };
    }

    verificationError = error;

    const normalizedMessage = (error.message || '').toLowerCase();
    const shouldTryFallback =
      otpType === 'email' &&
      (normalizedMessage.includes('invalid') ||
        normalizedMessage.includes('expired') ||
        normalizedMessage.includes('token') ||
        normalizedMessage.includes('otp') ||
        normalizedMessage.includes('email link'));

    if (!shouldTryFallback) {
      break;
    }
  }

  const message = (verificationError?.message || 'Invalid email OTP').replace(/\btoken\b/gi, 'OTP');
  return { ok: false, error: message };
}

class EmailService {
  private transporter: nodemailer.Transporter | null = null;

  constructor() { this.initializeTransporter(); }

  private initializeTransporter() {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return;
    }
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }

  async sendEmail({ to, subject, html, text }: EmailOptions): Promise<{ success: boolean; error?: unknown }> {
    if (!this.transporter) return { success: false, error: 'Email service not configured' };
    try {
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, html, text: text || '',
      });
      return { success: true };
    } catch (error) {
      console.error('Error sending email:', error);
      return { success: false, error };
    }
  }

  async sendServiceOfferRejectionEmail(email: string, offerTitle: string, rejectionReason?: string) {
    return this.sendEmail({
      to: email,
      subject: `Service Offer Update: ${offerTitle}`,
      html: `<h2>Service Offer Rejected</h2><p>Your service offer "${escapeHtml(offerTitle)}" has been rejected.</p>${rejectionReason ? `<p>Reason: ${escapeHtml(rejectionReason)}</p>` : ''}`,
      text: `Your service offer "${offerTitle}" has been rejected.${rejectionReason ? ` Reason: ${rejectionReason}` : ''}`,
    });
  }

  async sendServiceOfferApprovalEmail(email: string, offerTitle: string) {
    return this.sendEmail({
      to: email,
      subject: `Good News: ${offerTitle} is Now Live!`,
      html: `<h2>Service Offer Approved</h2><p>Congratulations! Your service offer "${escapeHtml(offerTitle)}" has been approved!</p>`,
      text: `Congratulations! Your service offer "${offerTitle}" has been approved!`,
    });
  }
}

export const emailService = new EmailService();
