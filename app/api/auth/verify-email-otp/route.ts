import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { supabase } from '@/lib/db'
import { normalizeEmailAddress, verifyEmailOtpWithSupabase } from '@/lib/email'

export const POST = withAuth(async (req) => {
  try {
    const body = await req.json()
    const email = typeof body?.email === 'string' ? body.email.trim() : ''
    const otp = typeof body?.otp === 'string' ? body.otp.trim() : ''

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    if (!otp) {
      return NextResponse.json({ error: 'Email OTP is required' }, { status: 400 })
    }

    const result = await verifyEmailOtpWithSupabase(normalizeEmailAddress(email), otp)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    const { error } = await supabase
      .from('users')
      .update({ email, email_verified: true, email_verified_at: new Date().toISOString() })
      .eq('id', req.user.id)

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'This email is already used by another account' }, { status: 409 })
      }
      throw error
    }

    return NextResponse.json({ success: true, message: 'Email OTP verified successfully', email })
  } catch (error) {
    console.error('Verify email OTP error:', error)
    return NextResponse.json({ error: 'Failed to verify email OTP' }, { status: 500 })
  }
})
