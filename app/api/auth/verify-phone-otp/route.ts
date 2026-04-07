import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth'
import { __phoneOtpStore } from '../send-phone-otp/route'

const normalizePhone = (value: string) => value.trim().replace(/\s+/g, '')

export const POST = withAuth(async (req: NextRequest) => {
  try {
    const user = (req as any).user
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
    const record = __phoneOtpStore.get(storeKey)

    if (!record) {
      return NextResponse.json({ error: 'Please request a phone OTP first' }, { status: 400 })
    }

    if (record.expiresAt <= Date.now()) {
      __phoneOtpStore.delete(storeKey)
      return NextResponse.json({ error: 'Phone OTP has expired. Please request a new one.' }, { status: 400 })
    }

    if (record.otp !== otp) {
      return NextResponse.json({ error: 'Invalid phone OTP' }, { status: 400 })
    }

    __phoneOtpStore.delete(storeKey)

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
