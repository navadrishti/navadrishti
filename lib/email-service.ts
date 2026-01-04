import nodemailer from 'nodemailer';

interface EmailConfig {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

class EmailService {
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.warn('SMTP configuration missing. Email functionality will be disabled.');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async sendEmail({ to, subject, html, text }: EmailConfig): Promise<{ success: boolean; error?: any }> {
    if (!this.transporter) {
      console.warn('Email service not configured. Email not sent.');
      return { success: false, error: 'Email service not configured' };
    }

    try {
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to,
        subject,
        html,
        text: text || '',
      });

      return { success: true };
    } catch (error) {
      console.error('Error sending email:', error);
      return { success: false, error };
    }
  }

  async sendServiceOfferRejectionEmail(email: string, offerTitle: string, rejectionReason?: string) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Service Offer Rejected</title>
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
            background: linear-gradient(135deg, #f44336 0%, #e91e63 100%);
            color: white; 
            padding: 30px; 
            text-align: center; 
          }
          .header h2 {
            margin: 0;
            font-size: 24px;
            font-weight: 600;
          }
          .content { 
            padding: 30px; 
          }
          .reason-box {
            background-color: #fff3e0;
            border-left: 4px solid #ff9800;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          }
          .footer { 
            margin-top: 30px; 
            padding-top: 20px;
            border-top: 1px solid #e0e0e0;
            font-size: 13px; 
            color: #666; 
            text-align: center; 
          }
          .offer-title {
            color: #f44336;
            font-weight: 600;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>❌ Service Offer Status Update</h2>
          </div>
          <div class="content">
            <p>Dear User,</p>
            <p>We regret to inform you that your service offer "<span class="offer-title">${offerTitle}</span>" has been rejected by our review team.</p>
            ${rejectionReason ? `
            <div class="reason-box">
              <strong>📋 Rejection Reason:</strong><br>
              ${rejectionReason}
            </div>
            ` : ''}
            <p>We understand this may be disappointing, but please don't be discouraged. You can:</p>
            <ul>
              <li>Review our service offer guidelines</li>
              <li>Make necessary adjustments to your offer</li>
              <li>Submit a revised offer for review</li>
              <li>Contact our support team if you have questions</li>
            </ul>
            <p>We appreciate your interest in contributing to our platform and look forward to seeing your future submissions.</p>
            <div class="footer">
              <p><strong>Need Help?</strong></p>
              <p>If you have any questions or need clarification, please don't hesitate to contact our support team.</p>
              <p style="margin-top: 20px; color: #999;">
                This is an automated message, please do not reply to this email.
              </p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail({
      to: email,
      subject: `Service Offer Update: ${offerTitle} - Action Required`,
      html,
      text: `Your service offer "${offerTitle}" has been rejected.${rejectionReason ? ` Reason: ${rejectionReason}` : ''} Please review and consider resubmitting with necessary changes.`,
    });
  }

  async sendServiceOfferApprovalEmail(email: string, offerTitle: string) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Service Offer Approved</title>
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
            background: linear-gradient(135deg, #4CAF50 0%, #8BC34A 100%);
            color: white; 
            padding: 30px; 
            text-align: center; 
          }
          .header h2 {
            margin: 0;
            font-size: 24px;
            font-weight: 600;
          }
          .content { 
            padding: 30px; 
          }
          .success-box {
            background-color: #e8f5e9;
            border-left: 4px solid #4CAF50;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          }
          .footer { 
            margin-top: 30px; 
            padding-top: 20px;
            border-top: 1px solid #e0e0e0;
            font-size: 13px; 
            color: #666; 
            text-align: center; 
          }
          .offer-title {
            color: #4CAF50;
            font-weight: 600;
          }
          .tips {
            background-color: #e3f2fd;
            padding: 15px;
            border-radius: 4px;
            margin: 20px 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>🎉 Congratulations! Service Offer Approved</h2>
          </div>
          <div class="content">
            <p>Dear User,</p>
            <p>Great news! Your service offer "<span class="offer-title">${offerTitle}</span>" has been approved and is now live on our platform!</p>
            <div class="success-box">
              <strong>✓ Your offer is now visible to all users</strong><br>
              Users can now view, interact with, and respond to your service offer.
            </div>
            <div class="tips">
              <strong>💡 Tips for Success:</strong>
              <ul style="margin: 10px 0 0 0; padding-left: 20px;">
                <li>Check your notifications regularly for inquiries</li>
                <li>Respond promptly to interested users</li>
                <li>Keep your offer details updated</li>
                <li>Maintain professional communication</li>
              </ul>
            </div>
            <p>Thank you for contributing to our community! We're excited to see your service help others.</p>
            <div class="footer">
              <p><strong>Questions or Need Support?</strong></p>
              <p>Our support team is here to help you make the most of your listing.</p>
              <p style="margin-top: 20px; color: #999;">
                This is an automated message, please do not reply to this email.
              </p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail({
      to: email,
      subject: `🎉 Good News: ${offerTitle} is Now Live!`,
      html,
      text: `Congratulations! Your service offer "${offerTitle}" has been approved and is now live on our platform. Users can now view and respond to your offer.`,
    });
  }

  async sendOrderConfirmationEmail(email: string, orderDetails: any) {
    // Implementation for order confirmation emails
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Order Confirmation</title>
      </head>
      <body>
        <h2>Order Confirmation</h2>
        <p>Thank you for your order!</p>
        <!-- Add order details here -->
      </body>
      </html>
    `;

    return this.sendEmail({
      to: email,
      subject: 'Order Confirmation',
      html,
      text: 'Thank you for your order!',
    });
  }
}

export const emailService = new EmailService();
