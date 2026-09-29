import { NextResponse } from 'next/server'

/** A fresh `initiate` would reset the account to pending, so it is only allowed before verification. */
export function initiateBlockedByStatus(verificationStatus: unknown): NextResponse | null {
  const status = String(verificationStatus || '').trim().toLowerCase()
  if (status === 'suspended') {
    return NextResponse.json(
      { error: 'Your verification is suspended. Please contact support.' },
      { status: 403 }
    )
  }
  if (status === 'verified') {
    return NextResponse.json(
      { error: 'Your account is already verified. Submit a reverification to update documents.' },
      { status: 409 }
    )
  }
  return null
}
