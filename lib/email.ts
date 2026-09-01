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

export function generateEmailVerificationTemplate(verificationUrl: string, userName?: string) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verify Your Email</title>
      <style>
        body { 
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
          line-height: 1.6; 
          color: #333; 
          background-color: #f4f4f4;
          margin: 0;
          padding: 0;
        }
        .container { 
          max-width: 600px; 
          margin: 30px auto; 
          padding: 0;
          background-color: #ffffff;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 30px;
          text-align: center;
        }
        .header h1 {
          margin: 0;
          font-size: 24px;
          font-weight: 600;
        }
        .content {
          padding: 30px;
        }
        .button { 
          display: inline-block; 
          padding: 14px 32px; 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white !important; 
          text-decoration: none; 
          border-radius: 5px; 
          margin: 20px 0;
          font-weight: 600;
          transition: transform 0.2s;
        }
        .button:hover {
          transform: translateY(-2px);
        }
        .link-box {
          background-color: #f8f9fa;
          padding: 15px;
          border-radius: 5px;
          word-break: break-all;
          margin: 15px 0;
        }
        .footer { 
          margin-top: 30px; 
          padding-top: 20px;
          border-top: 1px solid #e0e0e0;
          font-size: 13px; 
          color: #666; 
          text-align: center;
        }
        .warning {
          background-color: #fff3cd;
          border-left: 4px solid #ffc107;
          padding: 12px;
          margin: 20px 0;
          border-radius: 4px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✓ Verify Your Email Address</h1>
        </div>
        <div class="content">
          ${userName ? `<p>Hello <strong>${userName}</strong>,</p>` : '<p>Hello,</p>'}
          <p>Thank you for registering with us! We're excited to have you on board.</p>
          <p>To complete your registration and activate your account, please verify your email address by clicking the button below:</p>
          <div style="text-align: center;">
            <a href="${verificationUrl}" class="button">Verify Email Address</a>
          </div>
          <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
          <div class="link-box">
            <a href="${verificationUrl}" style="color: #667eea;">${verificationUrl}</a>
          </div>
          <div class="warning">
            <strong>⏰ Important:</strong> This verification link will expire in 24 hours for security reasons.
          </div>
          <p>Once verified, you'll have full access to all features of your account.</p>
          <div class="footer">
            <p><strong>Didn't create an account?</strong></p>
            <p>If you didn't sign up for an account, please ignore this email or contact our support team if you have concerns.</p>
            <p style="margin-top: 20px; color: #999;">
              This is an automated message, please do not reply to this email.
            </p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

export function generatePasswordResetEmail(resetUrl: string, userName?: string) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reset Your Password</title>
      <style>
        body { 
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
          line-height: 1.6; 
          color: #333; 
          background-color: #f4f4f4;
          margin: 0;
          padding: 0;
        }
        .container { 
          max-width: 600px; 
          margin: 30px auto; 
          padding: 0;
          background-color: #ffffff;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header {
          background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
          color: white;
          padding: 30px;
          text-align: center;
        }
        .header h1 {
          margin: 0;
          font-size: 24px;
          font-weight: 600;
        }
        .content {
          padding: 30px;
        }
        .button { 
          display: inline-block; 
          padding: 14px 32px; 
          background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
          color: white !important; 
          text-decoration: none; 
          border-radius: 5px; 
          margin: 20px 0;
          font-weight: 600;
          transition: transform 0.2s;
        }
        .button:hover {
          transform: translateY(-2px);
        }
        .link-box {
          background-color: #f8f9fa;
          padding: 15px;
          border-radius: 5px;
          word-break: break-all;
          margin: 15px 0;
        }
        .footer { 
          margin-top: 30px; 
          padding-top: 20px;
          border-top: 1px solid #e0e0e0;
          font-size: 13px; 
          color: #666; 
          text-align: center;
        }
        .warning {
          background-color: #fff3cd;
          border-left: 4px solid #ffc107;
          padding: 12px;
          margin: 20px 0;
          border-radius: 4px;
        }
        .security-tip {
          background-color: #e7f3ff;
          border-left: 4px solid #2196F3;
          padding: 12px;
          margin: 20px 0;
          border-radius: 4px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔐 Password Reset Request</h1>
        </div>
        <div class="content">
          ${userName ? `<p>Hello <strong>${userName}</strong>,</p>` : '<p>Hello,</p>'}
          <p>We received a request to reset the password for your account.</p>
          <p>If you made this request, click the button below to reset your password:</p>
          <div style="text-align: center;">
            <a href="${resetUrl}" class="button">Reset Password</a>
          </div>
          <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
          <div class="link-box">
            <a href="${resetUrl}" style="color: #f5576c;">${resetUrl}</a>
          </div>
          <div class="warning">
            <strong>⏰ Important:</strong> This password reset link will expire in 1 hour for security reasons.
          </div>
          <div class="security-tip">
            <strong>🛡️ Security Tip:</strong> After resetting your password, make sure to use a strong, unique password that you don't use on other sites.
          </div>
          <div class="footer">
            <p><strong>Didn't request a password reset?</strong></p>
            <p>If you didn't make this request, please ignore this email and your password will remain unchanged. However, if you're concerned about your account security, please contact our support team immediately.</p>
            <p style="margin-top: 20px; color: #999;">
              This is an automated message, please do not reply to this email.
            </p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
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

  async sendEmail({ to, subject, html, text }: EmailOptions): Promise<{ success: boolean; error?: any }> {
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
      html: `<h2>Service Offer Rejected</h2><p>Your service offer "${offerTitle}" has been rejected.</p>${rejectionReason ? `<p>Reason: ${rejectionReason}</p>` : ''}`,
      text: `Your service offer "${offerTitle}" has been rejected.${rejectionReason ? ` Reason: ${rejectionReason}` : ''}`,
    });
  }

  async sendServiceOfferApprovalEmail(email: string, offerTitle: string) {
    return this.sendEmail({
      to: email,
      subject: `Good News: ${offerTitle} is Now Live!`,
      html: `<h2>Service Offer Approved</h2><p>Congratulations! Your service offer "${offerTitle}" has been approved!</p>`,
      text: `Congratulations! Your service offer "${offerTitle}" has been approved!`,
    });
  }

  async sendOrderConfirmationEmail(email: string, orderDetails: any) {
    return this.sendEmail({
      to: email, subject: 'Order Confirmation',
      html: '<h2>Order Confirmation</h2><p>Thank you for your order!</p>',
      text: 'Thank you for your order!',
    });
  }
}

export const emailService = new EmailService();
