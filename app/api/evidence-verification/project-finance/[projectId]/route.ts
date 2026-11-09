import { NextRequest, NextResponse } from 'next/server'
import { isCompanyCaAssignedToProject } from '@/lib/company-ca'
import { authErrorResponse, getCompanyCAFromRequest } from '@/lib/server-auth'
import { loadCompanyCaProjectFinanceReport } from '@/lib/csr-agent/load-project-ops-finance'
import { getErrorMessage } from '@/lib/utils'

export const runtime = 'nodejs'

/**
 * Evidence Verifier project-level financial and operational report.
 * Scoped to the CA's company — never returns another organization's project.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const context = await getCompanyCAFromRequest(request)
    const companyId = Number(context.identity.company_user_id)
    if (!companyId) {
      return NextResponse.json({ success: false, error: 'Company scope missing' }, { status: 403 })
    }

    const { projectId } = await params
    if (!projectId || !/^[0-9a-f-]{36}$/i.test(projectId)) {
      return NextResponse.json({ success: false, error: 'Invalid project id' }, { status: 400 })
    }

    const assigned = await isCompanyCaAssignedToProject({
      companyCaUserId: context.user.id,
      companyUserId: companyId,
      projectId,
    })
    if (!assigned) {
      return NextResponse.json(
        { success: false, error: 'Evidence Verifier is not assigned to this project' },
        { status: 403 }
      )
    }

    const report = await loadCompanyCaProjectFinanceReport({
      projectId,
      companyUserId: companyId,
    })

    if (!report) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: report })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    if (
      error instanceof Error &&
      [
        'Evidence Verifier authentication required',
        'Invalid company CA token',
        'Evidence Verifier identity not found',
        'Evidence Verifier identity is not active',
      ].includes(error.message)
    ) {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 })
    }

    console.error('[evidence-verification/project-finance]', error)
    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(error) || 'Failed to load project finance report',
      },
      { status: 500 }
    )
  }
}
