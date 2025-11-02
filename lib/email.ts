// Email service utility using NodeMailer
import nodemailer from 'nodemailer';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

// Create transporter based on environment variables
const createTransporter = () => {
  // Check if SMTP is configured
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    const transporter = createTransporter();
    
    // If SMTP is not configured, log the email for development
    if (!transporter) {
      console.log('📧 EMAIL (SMTP NOT CONFIGURED):');
      console.log('To:', options.to);
      console.log('Subject:', options.subject);
      console.log('HTML:', options.html);
      return true;
    }

    // Send the email
    const info = await transporter.sendMail({
      from: `${process.env.FROM_NAME || 'Navdrishti'} <${process.env.FROM_EMAIL || process.env.SMTP_USER}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || options.html.replace(/<[^>]*>/g, ''), // Strip HTML for text version
    });

    console.log('📧 Email sent successfully:', info.messageId);
    return true;

  } catch (error) {
    console.error('❌ Error sending email:', error);
    return false;
  }
}

// Email template functions

export function generateEmailVerificationTemplate(verificationUrl: string, userEmail: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Email Verification - Navdrishti</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h1 style="color: #3b82f6; margin: 0; text-align: center;">
                🤝 Navdrishti
            </h1>
        </div>
        
        <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h2 style="color: #1f2937; margin-top: 0;">Verify Your Email Address</h2>
            
            <p>Hello,</p>
            
            <p>Welcome to Navdrishti! Please verify your email address to complete your account setup and access all platform features.</p>
            
            <p>Click the button below to verify your email:</p>
            
            <div style="text-align: center; margin: 30px 0;">
                <a href="${verificationUrl}" 
                   style="background-color: #10b981; color: white; padding: 12px 24px; 
                          text-decoration: none; border-radius: 6px; display: inline-block;
                          font-weight: bold;">
                    Verify Email Address
                </a>
            </div>
            
            <p>Or copy and paste this link in your browser:</p>
            <p style="word-break: break-all; color: #666; background-color: #f3f4f6; padding: 10px; border-radius: 4px; font-family: monospace;">
                ${verificationUrl}
            </p>
            
            <div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; padding: 15px; margin: 20px 0;">
                <p style="margin: 0; color: #92400e;">
                    <strong>Note:</strong> This verification link will expire in 24 hours for security reasons.
                </p>
            </div>
            
            <p>If you didn't create an account on Navdrishti, you can safely ignore this email.</p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <div style="text-align: center; color: #6b7280; font-size: 14px;">
                <p>This email was sent from Navdrishti</p>
                <p>© 2025 Navdrishti. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
  `;
}

export function generatePasswordResetEmail(resetUrl: string, userEmail: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Reset - Navdrishti</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h1 style="color: #3b82f6; margin: 0; text-align: center;">
                🤝 Navdrishti
            </h1>
        </div>
        
        <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h2 style="color: #1f2937; margin-top: 0;">Password Reset Request</h2>
            
            <p>Hello,</p>
            
            <p>We received a request to reset your password for your Navdrishti account.</p>
            
            <p>Click the button below to reset your password:</p>
            
            <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" 
                   style="background-color: #3b82f6; color: white; padding: 12px 24px; 
                          text-decoration: none; border-radius: 6px; display: inline-block;
                          font-weight: bold;">
                    Reset Password
                </a>
            </div>
            
            <p>Or copy and paste this link in your browser:</p>
            <p style="word-break: break-all; color: #666; background-color: #f3f4f6; padding: 10px; border-radius: 4px; font-family: monospace;">
                ${resetUrl}
            </p>
            
            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
                <p style="margin: 0;"><strong>⚠️ Important:</strong> This link will expire in 1 hour for security reasons.</p>
            </div>
            
            <p>If you didn't request this password reset, please ignore this email. Your password will remain unchanged.</p>
            
            <p>For security reasons, we recommend:</p>
            <ul>
                <li>Using a strong, unique password</li>
                <li>Not sharing your password with anyone</li>
                <li>Logging out from shared devices</li>
            </ul>
        </div>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
        
        <div style="text-align: center; color: #6b7280; font-size: 14px;">
            <p>This email was sent by Navdrishti</p>
            <p>If you have any questions, please contact our support team.</p>
            <p>© ${new Date().getFullYear()} Navdrishti. All rights reserved.</p>
        </div>
    </body>
    </html>
  `;
}