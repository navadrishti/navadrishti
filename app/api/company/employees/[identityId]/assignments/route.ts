import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  assertVerifiedCompanyEmployeeManager,
  assignCompanyEmployeeToProject,
  CompanyEmployeeAssignmentError,
  findCompanyEmployeeIdentityForCompany,
} from '@/lib/company-employee'
import { supabase } from '@/lib/db'
import { getAuthUserFromRequest, authErrorResponse } from '@/lib/server-auth'
import { zodIssuesToUserMessage } from '@/lib/user-facing-error'

const assignSchema = z.object({
  projectIds: z.array(z.string().uuid()).min(1).max(50),
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

    const identity = await findCompanyEmployeeIdentityForCompany(identityId, user.id)
    if (!identity) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('company_employee_project_assignments')
      .select(
        `
        id, company_employee_identity_id, company_employee_user_id, company_user_id, project_id,
        status, assigned_by, assigned_at, deactivated_at, created_at, updated_at,
        project:project_id (id, title, project_status, region, start_date, end_date)
      `
      )
      .eq('company_user_id', user.id)
      .eq('company_employee_identity_id', identityId)
      .order('assigned_at', { ascending: false })

    if (error) {
      console.error('Failed to list company employee assignments:', error)
      return NextResponse.json({ error: 'Failed to list assignments' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: data ?? [] })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error('Company employee assignments list error:', error)
    return NextResponse.json({ error: 'Failed to list assignments' }, { status: 500 })
  }
}

export async function POST(
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

    const body = await request.json().catch(() => null)
    const parsed = assignSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: zodIssuesToUserMessage(parsed.error.issues) || 'Invalid assignment payload' },
        { status: 400 }
      )
    }

    const uniqueProjectIds = [...new Set(parsed.data.projectIds)]
    const results: Array<{
      projectId: string
      ok: boolean
      created?: boolean
      assignmentId?: string
      error?: string
      status?: number
    }> = []

    for (const projectId of uniqueProjectIds) {
      try {
        const { assignment, created } = await assignCompanyEmployeeToProject({
          companyUserId: user.id,
          actorUserId: user.id,
          identityId,
          projectId,
        })
        results.push({
          projectId,
          ok: true,
          created,
          assignmentId: assignment.id,
        })
      } catch (error) {
        if (error instanceof CompanyEmployeeAssignmentError) {
          results.push({
            projectId,
            ok: false,
            error: error.message,
            status: error.status,
          })
          continue
        }
        console.error('Company employee assign error:', error)
        results.push({
          projectId,
          ok: false,
          error: 'Failed to assign project',
          status: 500,
        })
      }
    }

    const succeeded = results.filter((item) => item.ok)
    const failed = results.filter((item) => !item.ok)

    if (succeeded.length === 0) {
      const first = failed[0]
      return NextResponse.json(
        { error: first?.error || 'Failed to assign projects', results },
        { status: first?.status && first.status >= 400 ? first.status : 400 }
      )
    }

    return NextResponse.json({
      success: true,
      data: { results, assigned: succeeded.length, failed: failed.length },
    })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error('Company employee assign batch error:', error)
    return NextResponse.json({ error: 'Failed to assign projects' }, { status: 500 })
  }
}
