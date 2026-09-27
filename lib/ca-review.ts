import 'server-only'

import { NextResponse, type NextRequest } from 'next/server'
import { getCAFromRequest } from '@/lib/server-auth'
import type { PlatformCATokenPayload } from '@/lib/platform-ca-auth'
import { CAReviewError } from './ca-review/errors'

export { listCAQueue } from './ca-review/queue'
export { getCAReview } from './ca-review/review'
export { applyCAVerificationAction } from './ca-review/verification-action'
export { CAReviewError }

export function requireCA(request: NextRequest): PlatformCATokenPayload {
  const ca = getCAFromRequest(request)
  if (!ca) {
    throw new Error('CA authentication required')
  }
  return ca
}

export function caErrorResponse(error: unknown) {
  if (error instanceof Error && error.message === 'CA authentication required') {
    return NextResponse.json({ error: 'CA authentication required' }, { status: 401 })
  }
  if (error instanceof CAReviewError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  return null
}
