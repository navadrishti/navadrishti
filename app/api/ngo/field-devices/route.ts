import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabase } from '@/lib/db'
import { getAuthUserFromRequest, authErrorResponse } from '@/lib/server-auth'
import {
  assertNgoManagesFieldDevices,
  FieldDeviceError,
  listFieldDevicesForNgo,
  registerFieldDeviceForNgo,
} from '@/lib/ngo-field-devices'
import { zodIssuesToUserMessage } from '@/lib/user-facing-error'

const registerSchema = z.object({
  deviceId: z.string().trim().min(8).max(128),
  deviceLabel: z.string().trim().max(120).optional().nullable(),
  platform: z.string().trim().max(64).optional().nullable(),
  appVersion: z.string().trim().max(64).optional().nullable(),
})

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(request)
    await assertNgoManagesFieldDevices(user)

    const devices = await listFieldDevicesForNgo(user.id)

    const officerIds = [
      ...new Set(
        devices
          .map((device) => device.assigned_user_id)
          .filter((id): id is number => typeof id === 'number' && Number.isFinite(id))
      ),
    ]

    let officersById = new Map<number, { id: number; name: string | null; email: string | null }>()
    if (officerIds.length > 0) {
      const { data: officers, error } = await supabase
        .from('users')
        .select('id, name, email')
        .in('id', officerIds)
      if (error) {
        console.error('Failed to load device assignee profiles:', error)
      } else {
        officersById = new Map(
          (officers ?? []).map((row) => [
            Number(row.id),
            {
              id: Number(row.id),
              name: row.name == null ? null : String(row.name),
              email: row.email == null ? null : String(row.email),
            },
          ])
        )
      }
    }

    return NextResponse.json({
      success: true,
      data: devices.map((device) => ({
        ...device,
        assignee:
          device.assigned_user_id != null ? officersById.get(device.assigned_user_id) ?? null : null,
      })),
    })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error('List field devices error:', error)
    return NextResponse.json({ error: 'Failed to list field devices' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(request)
    await assertNgoManagesFieldDevices(user)

    const body = await request.json().catch(() => null)
    const parsed = registerSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: zodIssuesToUserMessage(parsed.error.issues) || 'Invalid device payload' },
        { status: 400 }
      )
    }

    const device = await registerFieldDeviceForNgo({
      ngoUserId: user.id,
      actorUserId: user.id,
      deviceId: parsed.data.deviceId,
      deviceLabel: parsed.data.deviceLabel,
      platform: parsed.data.platform,
      appVersion: parsed.data.appVersion,
    })

    return NextResponse.json({ success: true, data: device }, { status: 201 })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    if (error instanceof FieldDeviceError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('Register field device error:', error)
    return NextResponse.json({ error: 'Failed to register field device' }, { status: 500 })
  }
}
