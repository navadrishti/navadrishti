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
      return false;
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
        message: options.template || `Your GRAM verification code is ${options.otp}. Valid for 10 minutes. Do not share this code.`
      })
    });

    const smsData = await smsResponse.json();
    
    if (!smsResponse.ok) {
      console.error('SMS sending failed:', smsData);
      return false;
    }

    return true;

  } catch (error) {
    console.error('SMS service error:', error);
    return false;
  }
}

export function generateOTPMessage(otp: string, appName: string = 'GRAM'): string {
  return `Your ${appName} verification code is ${otp}. Valid for 10 minutes. Do not share this code with anyone.`;
}