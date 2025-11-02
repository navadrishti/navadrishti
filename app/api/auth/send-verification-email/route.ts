import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { supabase } from '@/lib/db';

export const POST = withAuth(async (req: NextRequest) => {
  try {
    const user = (req as any).user;
    
    // Check if email is already verified
    const { data: userData } = await supabase
      .from('users')
      .select('email_verified, email_verified_at')
      .eq('id', user.id)
      .single();

    if (userData?.email_verified) {
      return NextResponse.json({ 
        message: 'Email is already verified',
        verified: true 
      });
    }

    // Generate verification token
    const verificationToken = Math.random().toString(36).substring(2, 15) + 
                            Math.random().toString(36).substring(2, 15);
    
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours from now

    // Store verification token
    const { error } = await supabase
      .from('email_verifications')
      .upsert({
        user_id: user.id,
        token: verificationToken,
        expires_at: expiresAt.toISOString(),
        created_at: new Date().toISOString()
      });

    if (error) {
      console.error('Error storing verification token:', error);
      return NextResponse.json({ 
        error: 'Failed to generate verification token' 
      }, { status: 500 });
    }

    // In production, send actual email
    if (process.env.NODE_ENV === 'production' && process.env.SMTP_HOST) {
      try {
        const { sendEmail, generateEmailVerificationTemplate } = await import('@/lib/email');
        
        const emailHtml = generateEmailVerificationTemplate(
          `${process.env.APP_URL}/verify-email?token=${verificationToken}`,
          user.email
        );

        const emailSent = await sendEmail({
          to: user.email,
          subject: 'Verify your Navdrishti account',
          html: emailHtml
        });

        if (!emailSent) {
          console.error('Failed to send verification email');
          return NextResponse.json({ 
            error: 'Failed to send verification email' 
          }, { status: 500 });
        }

        console.log('Verification email sent successfully to:', user.email);
      } catch (error) {
        console.error('Email service error:', error);
        return NextResponse.json({ 
          error: 'Email service unavailable' 
        }, { status: 500 });
      }
    } else {
      // Development mode - just log the token
      console.log(`Development: Email verification token for ${user.email}: ${verificationToken}`);
      console.log(`Verification URL: ${process.env.APP_URL}/verify-email?token=${verificationToken}`);
    }

    return NextResponse.json({ 
      message: 'Verification email sent successfully',
      ...(process.env.NODE_ENV === 'development' && { 
        token: verificationToken,
        verificationUrl: `${process.env.APP_URL}/verify-email?token=${verificationToken}`
      })
    });

  } catch (error) {
    console.error('Send verification email error:', error);
    return NextResponse.json({ 
      error: 'Failed to send verification email' 
    }, { status: 500 });
  }
});