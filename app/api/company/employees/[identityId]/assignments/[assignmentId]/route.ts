import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  assertVerifiedCompanyEmployeeManager,
  CompanyEmployeeAssignmentError,
  setCompanyEmployeeAssignmentStatus,
} from '@/lib/company-employee'
import { getAuthUserFromRequest, authErrorResponse } from '@/lib/server-auth'
import { zodIssuesToUserMessage } from '@/lib/user-facing-error'

const statusSchema = z.object({
  status: z.enum(['active', 'inactive']),
})

function resolveParam(raw: unknown): string {
  return typeof raw === 'string' ? decodeURIComponent(raw).trim() : ''
}

export async function PATCH(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ identityId: string; assignmentId: string }>
  }
) {
  try {
    const user = await getAuthUserFromRequest(request)
    await assertVerifiedCompanyEmployeeManager(user)

    const resolvedParams = await params
    const identityId = resolveParam(resolvedParams?.identityId)
    const assignmentId = resolveParam(resolvedParams?.assignmentId)
    if (!identityId || !assignmentId) {
      return NextResponse.json({ error: 'Invalid assignment reference' }, { status: 400 })
    }

    const body = await request.json().catch(() => null)
    const parsed = statusSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: zodIssuesToUserMessage(parsed.error.issues) || 'Invalid status payload' },
        { status: 400 }
      )
    }

    const assignment = await setCompanyEmployeeAssignmentStatus({
      companyUserId: user.id,
      actorUserId: user.id,
      identityId,
      assignmentId,
      status: parsed.data.status,
    })

    return NextResponse.json({ success: true, data: assignment })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    if (error instanceof CompanyEmployeeAssignmentError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('Company employee assignment status error:', error)
    return NextResponse.json({ error: 'Failed to update assignment' }, { status: 500 })
  }
}
