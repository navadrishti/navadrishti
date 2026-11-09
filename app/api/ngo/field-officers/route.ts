import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { hashPassword } from '@/lib/auth'
import { supabase, db } from '@/lib/db'
import { getAuthUserFromRequest, authErrorResponse } from '@/lib/server-auth'
import {
  assertVerifiedNgoFieldOfficerManager,
  DEFAULT_FIELD_OFFICER_PERMISSIONS,
  NGO_FIELD_OFFICER_PROFILE_ROLE,
  writeFieldOfficerAudit,
} from '@/lib/ngo-field-officer'
import { zodIssuesToUserMessage } from '@/lib/user-facing-error'

const createFieldOfficerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
  permissions: z
    .object({
      can_submit_field_evidence: z.boolean().optional(),
    })
    .strict()
    .optional(),
  status: z.enum(['active', 'inactive']).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(request)
    await assertVerifiedNgoFieldOfficerManager(user)

    const { data, error } = await supabase
      .from('ngo_field_officer_identities')
      .select(
        'id, user_id, ngo_user_id, status, permissions, must_change_password, created_by, created_at, updated_at, last_login_at, deactivated_at, users:user_id(id, name, email)'
      )
      .eq('ngo_user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to list field officers:', error)
      return NextResponse.json({ error: 'Failed to list field officers' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: data ?? [] })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse

    console.error('Field officer list error:', error)
    return NextResponse.json({ error: 'Failed to list field officers' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(request)
    await assertVerifiedNgoFieldOfficerManager(user)

    const body = await request.json()
    const parsed = createFieldOfficerSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: zodIssuesToUserMessage(parsed.error.issues) || 'Please check your details and try again.' },
        { status: 400 }
      )
    }

    const { name, email, password, status } = parsed.data

    // Never accept client-supplied ngo_user_id / privilege escalation flags.
    // Evidence permission is automatic — ignore client permission toggles.
    const existing = await db.users.findByEmail(email)
    if (existing) {
      return NextResponse.json({ error: 'Unable to create field officer with this email' }, { status: 409 })
    }

    const hashedPassword = await hashPassword(password)
    const newUser = await db.users.create({
      email,
      password: hashedPassword,
      name,
      // individual keeps assertUserType(['ngo'|'company']) from succeeding.
      user_type: 'individual',
      verification_status: 'verified',
      email_verified: true,
      phone_verified: false,
      ngo_volunteer_capacity: 0,
      profile_data: {
        role: NGO_FIELD_OFFICER_PROFILE_ROLE,
        parent_ngo_user_id: user.id,
      },
    })

    const { data: identity, error: identityError } = await supabase
      .from('ngo_field_officer_identities')
      .insert({
        user_id: newUser.id,
        ngo_user_id: user.id,
        status: status ?? 'active',
        must_change_password: true,
        permissions: { ...DEFAULT_FIELD_OFFICER_PERMISSIONS },
        created_by: user.id,
      })
      .select('*')
      .single()

    if (identityError || !identity) {
      console.error('Failed to create field officer identity:', identityError)
      const { error: rollbackError } = await supabase.from('users').delete().eq('id', newUser.id)
      if (rollbackError) {
        console.error('Failed to roll back field officer user after identity insert failed:', rollbackError)
      }
      return NextResponse.json({ error: 'Failed to create field officer identity' }, { status: 500 })
    }

    await writeFieldOfficerAudit({
      identityId: identity.id,
      eventType: 'ngo_field_officer_created',
      ngoUserId: user.id,
      officerUserId: newUser.id,
      actorUserId: user.id,
      payload: {
        field_officer_email: email,
        status: identity.status,
      },
    })

    return NextResponse.json(
      {
        success: true,
        data: {
          identity,
          user: {
            id: newUser.id,
            name: newUser.name,
            email: newUser.email,
          },
        },
      },
      { status: 201 }
    )
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse

    console.error('Field officer create error:', error)
    return NextResponse.json({ error: 'Failed to create field officer' }, { status: 500 })
  }
}
