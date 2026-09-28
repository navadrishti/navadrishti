import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { supabase } from '@/lib/db'
import { attemptOneTimeCode } from '@/lib/one-time-codes'
import { limitAttempts } from '@/lib/rate-limit'

const PHONE_OTP_MAX_ATTEMPTS = 5

const normalizePhone = (value: string) => value.trim().replace(/\s+/g, '')

export const POST = withAuth(async (req) => {
  try {
    const user = req.user
    const body = await req.json()
    const phone = typeof body?.phone === 'string' ? normalizePhone(body.phone) : ''
    const otp = typeof body?.otp === 'string' ? body.otp.trim() : ''

    if (!phone) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 })
    }

    if (!otp) {
      return NextResponse.json({ error: 'Phone OTP is required' }, { status: 400 })
    }

    const storeKey = `${user.id}:${phone}`

    const limited = await limitAttempts(req, 'verify-phone-otp', storeKey)
    if (limited) return limited

    const { status } = await attemptOneTimeCode({
      purpose: 'phone_otp',
      subject: storeKey,
      code: otp,
      maxAttempts: PHONE_OTP_MAX_ATTEMPTS,
    })

    if (status === 'missing') {
      return NextResponse.json({ error: 'Please request a phone OTP first' }, { status: 400 })
    }

    if (status === 'expired') {
      return NextResponse.json({ error: 'Phone OTP has expired. Please request a new one.' }, { status: 400 })
    }

    if (status === 'locked') {
      return NextResponse.json({ error: 'Too many incorrect attempts. Please request a new phone OTP.' }, { status: 429 })
    }

    if (status !== 'ok') {
      return NextResponse.json({ error: 'Invalid phone OTP' }, { status: 400 })
    }

    const { error } = await supabase
      .from('users')
      .update({ phone, phone_verified: true, phone_verified_at: new Date().toISOString() })
      .eq('id', user.id)
    if (error) throw error

    return NextResponse.json({
      success: true,
      message: 'Phone OTP verified successfully',
      phone
    })
  } catch (error) {
    console.error('Verify phone OTP error:', error)
    return NextResponse.json({ error: 'Failed to verify phone OTP' }, { status: 500 })
  }
})
