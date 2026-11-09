import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  assertVerifiedCompanyEmployeeManager,
  CompanyEmployeeError,
  findCompanyEmployeeIdentityForCompany,
  resetCompanyEmployeePassword,
  setCompanyEmployeeStatus,
} from '@/lib/company-employee'
import { supabase } from '@/lib/db'
import {
  getAuthUserFromRequest,
  authErrorResponse,
  forgetSessionBlockReason,
} from '@/lib/server-auth'
import { zodIssuesToUserMessage } from '@/lib/user-facing-error'

const statusUpdateSchema = z.object({
  status: z.enum(['active', 'inactive']),
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
    await assertVerifiedCompanyEmployeeManager(user)

    const resolvedParams = await params
    const identityId = resolveIdentityId(resolvedParams?.identityId)
    if (!identityId) {
      return NextResponse.json({ error: 'Invalid employee identity id' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('company_employee_identities')
      .select(
        'id, user_id, company_user_id, status, permissions, must_change_password, created_by, created_at, updated_at, last_login_at, deactivated_at, users:user_id(id, name, email)'
      )
      .eq('id', identityId)
      .eq('company_user_id', user.id)
      .maybeSingle()

    if (error) {
      console.error('Failed to fetch company employee:', error)
      return NextResponse.json({ error: 'Failed to fetch employee' }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    }

    const { data: assignments, error: assignmentError } = await supabase
      .from('company_employee_project_assignments')
      .select(
        `
        id, company_employee_identity_id, project_id, status, assigned_by, assigned_at, deactivated_at, created_at, updated_at,
        project:project_id (id, title, project_status, region, start_date, end_date)
      `
      )
      .eq('company_user_id', user.id)
      .eq('company_employee_identity_id', identityId)
      .order('assigned_at', { ascending: false })

    if (assignmentError) {
      console.error('Failed to fetch employee assignments:', assignmentError)
    }

    const { data: activity, error: activityError } = await supabase
      .from('csr_audit_log')
      .select('id, event_type, event_payload, created_at, created_by')
      .eq('entity_type', 'company_employee_identity')
      .eq('entity_id', identityId)
      .order('created_at', { ascending: false })
      .limit(30)

    if (activityError) {
      console.error('Failed to fetch employee activity:', activityError)
    }

    return NextResponse.json({
      success: true,
      data: {
        ...data,
        assignments: assignmentError ? [] : assignments ?? [],
        activity: activityError ? [] : activity ?? [],
      },
    })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error('Company employee get error:', error)
    return NextResponse.json({ error: 'Failed to fetch employee' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ identityId: string }> }
) {
  try {
    const user = await getAuthUserFromRequest(request)
    await assertVerifiedCompanyEmployeeManager(user)

    const resolvedParams = await params
    const identityId = resolveIdentityId(resolvedParams?.identityId)
    if (!identityId) {
      return NextResponse.json({ error: 'Invalid employee identity id' }, { status: 400 })
    }

    const existing = await findCompanyEmployeeIdentityForCompany(identityId, user.id)
    if (!existing) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => null)
    const passwordReset = passwordResetSchema.safeParse(body)
    if (passwordReset.success) {
      const updated = await resetCompanyEmployeePassword({
        identityId,
        companyUserId: user.id,
        password: passwordReset.data.password,
        actorUserId: user.id,
      })
      forgetSessionBlockReason(existing.user_id)
      return NextResponse.json({
        success: true,
        message: 'Password reset. The employee must change it on next login.',
        data: updated,
      })
    }

    const parsed = statusUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: zodIssuesToUserMessage(parsed.error.issues) || 'Please check your details and try again.' },
        { status: 400 }
      )
    }

    const updated = await setCompanyEmployeeStatus({
      identityId,
      companyUserId: user.id,
      status: parsed.data.status,
      actorUserId: user.id,
    })
    forgetSessionBlockReason(existing.user_id)

    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    if (error instanceof CompanyEmployeeError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('Company employee update error:', error)
    return NextResponse.json({ error: 'Failed to update employee' }, { status: 500 })
  }
}
