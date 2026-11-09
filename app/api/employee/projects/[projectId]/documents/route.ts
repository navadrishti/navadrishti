import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  assertActiveCompanyEmployee,
  assertEmployeeAssignedToCompanyProject,
  CompanyEmployeeError,
} from '@/lib/company-employee'
import { supabase } from '@/lib/db'
import { assembleGeneratedDocument } from '@/lib/document-generation/assemble'
import type { DocumentTypeId } from '@/lib/document-generation/types'
import { getAuthUserFromRequest, authErrorResponse } from '@/lib/server-auth'
import { getErrorMessage } from '@/lib/utils'
import { zodIssuesToUserMessage } from '@/lib/user-facing-error'

const generateSchema = z.object({
  documentType: z.enum(['impact_report', 'utilization_certificate']),
  period: z.enum(['quarterly', 'annual', 'custom']).optional().nullable(),
  periodStart: z.string().optional().nullable(),
  periodEnd: z.string().optional().nullable(),
})

function resolveProjectId(raw: unknown): string {
  return typeof raw === 'string' ? decodeURIComponent(raw).trim() : ''
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const user = await getAuthUserFromRequest(request)
    const identity = await assertActiveCompanyEmployee(user)

    const resolvedParams = await params
    const projectId = resolveProjectId(resolvedParams?.projectId)
    if (!projectId) {
      return NextResponse.json({ error: 'Invalid project id' }, { status: 400 })
    }

    await assertEmployeeAssignedToCompanyProject({
      identity,
      projectId,
    })

    const { data: project, error: projectError } = await supabase
      .from('csr_projects')
      .select('id, campaign_id, company_user_id, title')
      .eq('id', projectId)
      .eq('company_user_id', identity.company_user_id)
      .maybeSingle()

    if (projectError) {
      console.error('Employee project lookup failed')
      return NextResponse.json({ error: 'Authorization service temporarily unavailable' }, { status: 503 })
    }
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => null)
    const parsed = generateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: zodIssuesToUserMessage(parsed.error.issues) || 'Please check your request and try again.' },
        { status: 400 }
      )
    }

    const companyActor = {
      ...user,
      id: identity.company_user_id,
      user_type: 'company' as const,
    }

    // Always assemble with projectId only — never pass campaignId for employees,
    // so sibling campaign projects cannot leak into the document.
    const documentType = parsed.data.documentType as DocumentTypeId
    const result = await assembleGeneratedDocument(companyActor, {
      documentType,
      projectId,
      period: parsed.data.period,
      periodStart: parsed.data.periodStart,
      periodEnd: parsed.data.periodEnd,
    })

    return NextResponse.json({
      success: true,
      documentType,
      format: 'html',
      filename: result.filename,
      label: result.label,
      entityTitle: 'entityTitle' in result ? result.entityTitle : undefined,
      html: result.html,
      scoped_project_id: projectId,
      scoped_project_title: project.title,
    })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    if (error instanceof CompanyEmployeeError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('Employee document generate error:', error)
    return NextResponse.json(
      { error: getErrorMessage(error) || 'Failed to generate document' },
      { status: 500 }
    )
  }
}
