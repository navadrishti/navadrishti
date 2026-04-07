import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { withAuth } from '@/lib/auth'
import { sendSMS, generateOTPMessage } from '@/lib/sms'

const PHONE_OTP_TTL_MS = 10 * 60 * 1000
const PHONE_OTP_RESEND_MS = 60 * 1000

type PhoneOtpRecord = {
  userId: number
  phone: string
  otp: string
  expiresAt: number
  lastSentAt: number
}

const phoneOtpStore = new Map<string, PhoneOtpRecord>()

const normalizePhone = (value: string) => value.trim().replace(/\s+/g, '')

const cleanupExpiredRecords = () => {
  const now = Date.now()
  for (const [key, record] of phoneOtpStore.entries()) {
    if (record.expiresAt <= now) {
      phoneOtpStore.delete(key)
    }
  }
}

export const POST = withAuth(async (req: NextRequest) => {
  try {
    const user = (req as any).user
    const body = await req.json()
    const phone = typeof body?.phone === 'string' ? normalizePhone(body.phone) : ''

    if (!phone) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 })
    }

    cleanupExpiredRecords()
    const storeKey = `${user.id}:${phone}`
    const existingRecord = phoneOtpStore.get(storeKey)

    if (existingRecord && Date.now() - existingRecord.lastSentAt < PHONE_OTP_RESEND_MS) {
      const retryAfterSeconds = Math.ceil((PHONE_OTP_RESEND_MS - (Date.now() - existingRecord.lastSentAt)) / 1000)
      return NextResponse.json({ error: `Please wait ${retryAfterSeconds}s before requesting another phone OTP` }, { status: 429 })
    }

    const otp = String(crypto.randomInt(100000, 999999))
    const sent = await sendSMS({
      phone,
      otp,
      template: generateOTPMessage(otp)
    })

    if (!sent) {
      return NextResponse.json({ error: 'Failed to send phone OTP' }, { status: 500 })
    }

    phoneOtpStore.set(storeKey, {
      userId: user.id,
      phone,
      otp,
      expiresAt: Date.now() + PHONE_OTP_TTL_MS,
      lastSentAt: Date.now()
    })

    return NextResponse.json({
      success: true,
      message: 'Phone OTP sent successfully',
      phone,
      ...(process.env.NODE_ENV === 'development' ? { otp } : {})
    })
  } catch (error) {
    console.error('Send phone OTP error:', error)
    return NextResponse.json({ error: 'Failed to send phone OTP' }, { status: 500 })
  }
})

export { phoneOtpStore as __phoneOtpStore }
