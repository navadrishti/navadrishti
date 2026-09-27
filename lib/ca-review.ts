import 'server-only'

import type { NextRequest } from 'next/server'
import { getCAFromRequest } from '@/lib/server-auth'
import type { PlatformCATokenPayload } from '@/lib/platform-ca-auth'

export { listCAQueue } from './ca-review/queue'
export { getCAReview } from './ca-review/review'
export { applyCAVerificationAction } from './ca-review/verification-action'

export function requireCA(request: NextRequest): PlatformCATokenPayload {
  const ca = getCAFromRequest(request)
  if (!ca) {
    throw new Error('CA authentication required')
  }
  return ca
}
