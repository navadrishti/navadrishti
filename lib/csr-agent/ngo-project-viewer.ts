import { NextRequest } from 'next/server'
import { assertUserType, findAuthUser, getAuthUserFromRequest } from '@/lib/server-auth'

export async function resolveNgoProjectViewer(request: NextRequest) {
  const explicitNgoView = request.nextUrl.searchParams.get('viewer') === 'ngo'
  const bearerUser = findAuthUser(request, { allowCookie: false })
  if (!explicitNgoView && bearerUser?.user_type !== 'ngo') return null
  const user = await getAuthUserFromRequest(request)
  assertUserType(user, ['ngo'])
  return user
}
