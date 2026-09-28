import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { withAuth } from '@/lib/auth'
import { consumeOneTimeCode, issueOneTimeCode } from '@/lib/one-time-codes'
import { sendSMS, generateOTPMessage } from '@/lib/sms'

const PHONE_OTP_TTL_MS = 10 * 60 * 1000
const PHONE_OTP_RESEND_MS = 60 * 1000

const normalizePhone = (value: string) => value.trim().replace(/\s+/g, '')

export const POST = withAuth(async (req) => {
  try {
    const user = req.user
    const body = await req.json()
    const phone = typeof body?.phone === 'string' ? normalizePhone(body.phone) : ''

    if (!phone) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 })
    }

    const subject = `${user.id}:${phone}`
    const otp = String(crypto.randomInt(100000, 999999))
    const issued = await issueOneTimeCode({
      purpose: 'phone_otp',
      subject,
      code: otp,
      userId: user.id,
      ttlMs: PHONE_OTP_TTL_MS,
      resendMs: PHONE_OTP_RESEND_MS,
    })

    if (!issued.issued) {
      return NextResponse.json({ error: `Please wait ${issued.retryAfterSeconds}s before requesting another phone OTP` }, { status: 429 })
    }

    const sent = await sendSMS({
      phone,
      otp,
      template: generateOTPMessage(otp)
    }).catch((error) => {
      console.error('Send phone OTP error:', error)
      return false
    })

    if (!sent) {
      await consumeOneTimeCode('phone_otp', subject, otp)
      return NextResponse.json({ error: 'Failed to send phone OTP' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Phone OTP sent successfully',
      phone,
    })
  } catch (error) {
    console.error('Send phone OTP error:', error)
    return NextResponse.json({ error: 'Failed to send phone OTP' }, { status: 500 })
  }
})
