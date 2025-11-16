// SMS service utility for phone verification
export interface SMSOptions {
  phone: string;
  otp: string;
  template?: string;
}

export async function sendSMS(options: SMSOptions): Promise<boolean> {
  try {
    // Check if SMS service is configured
    if (!process.env.MSG91_API_KEY || !process.env.MSG91_TEMPLATE_ID) {
      console.log('📱 SMS (Service not configured):');
      console.log('Phone:', options.phone);
      console.log('OTP:', options.otp);
      return true;
    }

    // MSG91 SMS API Integration
    const smsResponse = await fetch('https://api.msg91.com/api/v5/otp', {
      method: 'POST',
      headers: {
        'authkey': process.env.MSG91_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        template_id: process.env.MSG91_TEMPLATE_ID,
        mobile: options.phone.replace(/[^\d]/g, ''), // Clean phone number
        authkey: process.env.MSG91_API_KEY,
        otp: options.otp,
        message: options.template || `Your Navadrishti verification code is ${options.otp}. Valid for 10 minutes. Do not share this code.`
      })
    });

    const smsData = await smsResponse.json();
    
    if (!smsResponse.ok) {
      console.error('❌ SMS sending failed:', smsData);
      return false;
    }

    console.log('📱 SMS sent successfully to:', options.phone);
    return true;

  } catch (error) {
    console.error('❌ SMS service error:', error);
    return false;
  }
}

// Alternative SMS services (Twilio, AWS SNS, etc.)
export async function sendSMSWithTwilio(options: SMSOptions): Promise<boolean> {
  try {
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      console.log('Twilio not configured');
      return false;
    }

    // Twilio SMS implementation
    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

    await client.messages.create({
      body: options.template || `Your Navadrishti verification code is ${options.otp}. Valid for 10 minutes.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: options.phone
    });

    console.log('📱 SMS sent via Twilio to:', options.phone);
    return true;

  } catch (error) {
    console.error('❌ Twilio SMS error:', error);
    return false;
  }
}

export function generateOTPMessage(otp: string, appName: string = 'Navadrishti'): string {
  return `Your ${appName} verification code is ${otp}. Valid for 10 minutes. Do not share this code with anyone.`;
}