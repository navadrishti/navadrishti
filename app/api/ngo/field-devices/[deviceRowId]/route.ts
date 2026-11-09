import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUserFromRequest, authErrorResponse } from '@/lib/server-auth'
import {
  assertNgoManagesFieldDevices,
  bindFieldDeviceToOfficer,
  FieldDeviceError,
  findFieldDeviceForNgo,
  reactivateFieldDevice,
  revokeFieldDevice,
  unassignFieldDevice,
} from '@/lib/ngo-field-devices'
import { zodIssuesToUserMessage } from '@/lib/user-facing-error'

const patchSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('bind'),
    identityId: z.string().uuid(),
  }),
  z.object({
    action: z.literal('reassign'),
    identityId: z.string().uuid(),
  }),
  z.object({
    action: z.literal('unassign'),
  }),
  z.object({
    action: z.literal('revoke'),
  }),
  z.object({
    action: z.literal('reactivate'),
  }),
])

function resolveId(raw: unknown): string {
  return typeof raw === 'string' ? decodeURIComponent(raw).trim() : ''
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ deviceRowId: string }> }
) {
  try {
    const user = await getAuthUserFromRequest(request)
    await assertNgoManagesFieldDevices(user)

    const resolved = await params
    const deviceRowId = resolveId(resolved?.deviceRowId)
    if (!deviceRowId) {
      return NextResponse.json({ error: 'Invalid device id' }, { status: 400 })
    }

    const device = await findFieldDeviceForNgo(deviceRowId, user.id)
    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: device })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error('Get field device error:', error)
    return NextResponse.json({ error: 'Failed to load field device' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ deviceRowId: string }> }
) {
  try {
    const user = await getAuthUserFromRequest(request)
    await assertNgoManagesFieldDevices(user)

    const resolved = await params
    const deviceRowId = resolveId(resolved?.deviceRowId)
    if (!deviceRowId) {
      return NextResponse.json({ error: 'Invalid device id' }, { status: 400 })
    }

    const body = await request.json().catch(() => null)
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: zodIssuesToUserMessage(parsed.error.issues) || 'Invalid device action' },
        { status: 400 }
      )
    }

    let device
    switch (parsed.data.action) {
      case 'bind':
      case 'reassign':
        device = await bindFieldDeviceToOfficer({
          ngoUserId: user.id,
          actorUserId: user.id,
          deviceRowId,
          identityId: parsed.data.identityId,
        })
        break
      case 'unassign':
        device = await unassignFieldDevice({
          ngoUserId: user.id,
          actorUserId: user.id,
          deviceRowId,
        })
        break
      case 'revoke':
        device = await revokeFieldDevice({
          ngoUserId: user.id,
          actorUserId: user.id,
          deviceRowId,
        })
        break
      case 'reactivate':
        device = await reactivateFieldDevice({
          ngoUserId: user.id,
          actorUserId: user.id,
          deviceRowId,
        })
        break
      default:
        return NextResponse.json({ error: 'Unsupported action' }, { status: 400 })
    }

    return NextResponse.json({ success: true, data: device })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    if (error instanceof FieldDeviceError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('Patch field device error:', error)
    return NextResponse.json({ error: 'Failed to update field device' }, { status: 500 })
  }
}
