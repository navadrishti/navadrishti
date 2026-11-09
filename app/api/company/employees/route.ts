import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  assertVerifiedCompanyEmployeeManager,
  CompanyEmployeeError,
  createCompanyEmployee,
} from '@/lib/company-employee'
import { supabase } from '@/lib/db'
import { getAuthUserFromRequest, authErrorResponse } from '@/lib/server-auth'
import { zodIssuesToUserMessage } from '@/lib/user-facing-error'

const createEmployeeSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
})

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(request)
    await assertVerifiedCompanyEmployeeManager(user)

    const { data, error } = await supabase
      .from('company_employee_identities')
      .select(
        'id, user_id, company_user_id, status, permissions, must_change_password, created_by, created_at, updated_at, last_login_at, deactivated_at, users:user_id(id, name, email)'
      )
      .eq('company_user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to list company employees:', error)
      return NextResponse.json({ error: 'Failed to list employees' }, { status: 500 })
    }

    const identities = data ?? []
    const identityIds = identities.map((row) => String(row.id))
    let assignmentsByIdentity = new Map<string, Array<Record<string, unknown>>>()

    if (identityIds.length > 0) {
      const { data: assignments, error: assignmentError } = await supabase
        .from('company_employee_project_assignments')
        .select(
          `
          id, company_employee_identity_id, project_id, status, assigned_at, deactivated_at,
          project:project_id (id, title, project_status)
        `
        )
        .eq('company_user_id', user.id)
        .in('company_employee_identity_id', identityIds)
        .order('assigned_at', { ascending: false })

      if (assignmentError) {
        console.error('Failed to list employee assignments:', assignmentError)
      } else {
        assignmentsByIdentity = new Map()
        for (const row of assignments ?? []) {
          const key = String(row.company_employee_identity_id)
          const list = assignmentsByIdentity.get(key) ?? []
          list.push(row as Record<string, unknown>)
          assignmentsByIdentity.set(key, list)
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: identities.map((row) => ({
        ...row,
        assignments: assignmentsByIdentity.get(String(row.id)) ?? [],
      })),
    })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error('Company employee list error:', error)
    return NextResponse.json({ error: 'Failed to list employees' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(request)
    await assertVerifiedCompanyEmployeeManager(user)

    const body = await request.json().catch(() => null)
    const parsed = createEmployeeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: zodIssuesToUserMessage(parsed.error.issues) || 'Please check your details and try again.' },
        { status: 400 }
      )
    }

    const created = await createCompanyEmployee({
      companyUserId: user.id,
      actorUserId: user.id,
      name: parsed.data.name,
      email: parsed.data.email,
      password: parsed.data.password,
    })

    return NextResponse.json(
      {
        success: true,
        data: {
          identity: created.identity,
          user: created.user,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    if (error instanceof CompanyEmployeeError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('Company employee create error:', error)
    return NextResponse.json({ error: 'Failed to create employee' }, { status: 500 })
  }
}
