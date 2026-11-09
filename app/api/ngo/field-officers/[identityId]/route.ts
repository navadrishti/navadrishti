import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabase, db } from '@/lib/db'
import { getAuthUserFromRequest, authErrorResponse } from '@/lib/server-auth'
import {
  assertVerifiedNgoFieldOfficerManager,
  DEFAULT_FIELD_OFFICER_PERMISSIONS,
  findFieldOfficerIdentityForNgo,
  resetFieldOfficerPassword,
  writeFieldOfficerAudit,
} from '@/lib/ngo-field-officer'
import { zodIssuesToUserMessage } from '@/lib/user-facing-error'

const statusUpdateSchema = z.object({
  status: z.enum(['active', 'inactive']),
})

const profileUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120),
})

const permissionsUpdateSchema = z.object({
  permissions: z
    .object({
      can_submit_field_evidence: z.boolean(),
    })
    .strict(),
})

const passwordResetSchema = z.object({
  action: z.literal('reset_password'),
  password: z.string().min(8).max(128),
})

function resolveIdentityId(raw: unknown): string {
  return typeof raw === 'string' ? decodeURIComponent(raw).trim() : ''
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ identityId: string }> }
) {
  try {
    const user = await getAuthUserFromRequest(request)
    await assertVerifiedNgoFieldOfficerManager(user)

    const resolvedParams = await params
    const identityId = resolveIdentityId(resolvedParams?.identityId)
    if (!identityId) {
      return NextResponse.json({ error: 'Invalid field officer identity id' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('ngo_field_officer_identities')
      .select(
        'id, user_id, ngo_user_id, status, permissions, must_change_password, created_by, created_at, updated_at, last_login_at, deactivated_at, users:user_id(id, name, email)'
      )
      .eq('id', identityId)
      .eq('ngo_user_id', user.id)
      .maybeSingle()

    if (error) {
      console.error('Failed to fetch field officer:', error)
      return NextResponse.json({ error: 'Failed to fetch field officer' }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Field officer identity not found' }, { status: 404 })
    }

    const { data: activity, error: activityError } = await supabase
      .from('csr_audit_log')
      .select('id, event_type, event_payload, created_at, created_by')
      .eq('entity_type', 'ngo_field_officer_identity')
      .eq('entity_id', identityId)
      .order('created_at', { ascending: false })
      .limit(30)

    if (activityError) {
      console.error('Failed to fetch field officer activity:', activityError)
    }

    return NextResponse.json({
      success: true,
      data: {
        ...data,
        activity: activityError ? [] : activity ?? [],
      },
    })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse

    console.error('Field officer get error:', error)
    return NextResponse.json({ error: 'Failed to fetch field officer' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ identityId: string }> }
) {
  try {
    const user = await getAuthUserFromRequest(request)
    await assertVerifiedNgoFieldOfficerManager(user)

    const body = await request.json()
    const resolvedParams = await params
    const identityId = resolveIdentityId(resolvedParams?.identityId)
    if (!identityId) {
      return NextResponse.json({ error: 'Invalid field officer identity id' }, { status: 400 })
    }

    const existing = await findFieldOfficerIdentityForNgo(identityId, user.id)
    if (!existing) {
      return NextResponse.json({ error: 'Field officer identity not found' }, { status: 404 })
    }

    const passwordReset = passwordResetSchema.safeParse(body)
    if (passwordReset.success) {
      try {
        const updated = await resetFieldOfficerPassword({
          identityId,
          ngoUserId: user.id,
          password: passwordReset.data.password,
          actorUserId: user.id,
        })
        return NextResponse.json({
          success: true,
          message: 'Password reset. The field officer must change it on next login.',
          data: updated,
        })
      } catch (error) {
        if (error instanceof Error && error.message === 'FIELD_OFFICER_NOT_FOUND') {
          return NextResponse.json({ error: 'Field officer identity not found' }, { status: 404 })
        }
        throw error
      }
    }

    const profileUpdate = profileUpdateSchema.safeParse(body)
    if (profileUpdate.success) {
      const updatedUser = await db.users.update(existing.user_id, {
        name: profileUpdate.data.name,
        updated_at: new Date().toISOString(),
      })

      await writeFieldOfficerAudit({
        identityId,
        eventType: 'ngo_field_officer_profile_updated',
        ngoUserId: user.id,
        officerUserId: existing.user_id,
        actorUserId: user.id,
        payload: {
          previous_name: undefined,
          new_name: profileUpdate.data.name,
        },
      })

      return NextResponse.json({
        success: true,
        data: {
          identity: existing,
          user: {
            id: updatedUser.id,
            name: updatedUser.name,
            email: updatedUser.email,
          },
        },
      })
    }

    const permissionsUpdate = permissionsUpdateSchema.safeParse(body)
    if (permissionsUpdate.success) {
      // Evidence submission is automatic; client cannot disable it.
      const nextPermissions = { ...DEFAULT_FIELD_OFFICER_PERMISSIONS }

      const { data: updated, error: updateError } = await supabase
        .from('ngo_field_officer_identities')
        .update({
          permissions: nextPermissions,
          updated_at: new Date().toISOString(),
        })
        .eq('id', identityId)
        .eq('ngo_user_id', user.id)
        .select('*')
        .single()

      if (updateError || !updated) {
        console.error('Failed to update field officer permissions:', updateError)
        return NextResponse.json({ error: 'Failed to update field officer permissions' }, { status: 500 })
      }

      await writeFieldOfficerAudit({
        identityId,
        eventType: 'ngo_field_officer_permissions_updated',
        ngoUserId: user.id,
        officerUserId: existing.user_id,
        actorUserId: user.id,
        payload: {
          previous_permissions: existing.permissions,
          new_permissions: nextPermissions,
          note: 'Evidence permission is fixed to enabled for Field Officers.',
        },
      })

      return NextResponse.json({ success: true, data: updated })
    }

    const parsed = statusUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: zodIssuesToUserMessage(parsed.error.issues) || 'Please check your details and try again.' },
        { status: 400 }
      )
    }

    const { status } = parsed.data
    const now = new Date().toISOString()
    const { data: updated, error: updateError } = await supabase
      .from('ngo_field_officer_identities')
      .update({
        status,
        updated_at: now,
        deactivated_at: status === 'inactive' ? now : null,
      })
      .eq('id', identityId)
      .eq('ngo_user_id', user.id)
      .select('*')
      .single()

    if (updateError || !updated) {
      console.error('Failed to update field officer status:', updateError)
      return NextResponse.json({ error: 'Failed to update field officer status' }, { status: 500 })
    }

    const eventType =
      status === 'active' ? 'ngo_field_officer_activated' : 'ngo_field_officer_deactivated'

    await writeFieldOfficerAudit({
      identityId,
      eventType,
      ngoUserId: user.id,
      officerUserId: existing.user_id,
      actorUserId: user.id,
      payload: {
        previous_status: existing.status,
        new_status: status,
      },
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse

    console.error('Field officer update error:', error)
    return NextResponse.json({ error: 'Failed to update field officer' }, { status: 500 })
  }
}
