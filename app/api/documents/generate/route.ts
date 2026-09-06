import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUserFromRequest, assertUserType } from '@/lib/server-auth'
import { assembleGeneratedDocument } from '@/lib/document-generation/assemble'
import type { DocumentTypeId } from '@/lib/document-generation/types'

const generateSchema = z.object({
  documentType: z.enum([
    'impact_report',
    'csr_compliance_profile',
    'csr_policy_document',
    'utilization_certificate',
    'board_csr_annexure_draft',
    'implementing_agency_report',
    'ngo_compliance_pack',
  ]),
  campaignId: z.string().min(1).optional().nullable(),
  projectId: z.string().min(1).optional().nullable(),
  period: z.enum(['quarterly', 'annual', 'custom']).optional().nullable(),
  periodStart: z.string().optional().nullable(),
  periodEnd: z.string().optional().nullable(),
})

const COMPANY_ONLY_TYPES = new Set<DocumentTypeId>([
  'csr_compliance_profile',
  'csr_policy_document',
  'board_csr_annexure_draft',
])

const NGO_ONLY_TYPES = new Set<DocumentTypeId>([
  'implementing_agency_report',
  'ngo_compliance_pack',
])

export async function POST(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request)
    assertUserType(user, ['company', 'ngo'])

    const body = await request.json().catch(() => null)
    const parsed = generateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid request' },
        { status: 400 }
      )
    }

    const documentType = parsed.data.documentType as DocumentTypeId
    if (user.user_type === 'ngo' && COMPANY_ONLY_TYPES.has(documentType)) {
      return NextResponse.json(
        { error: 'This document type is available to companies only' },
        { status: 403 }
      )
    }
    if (user.user_type === 'company' && NGO_ONLY_TYPES.has(documentType)) {
      return NextResponse.json(
        { error: 'This document type is available to NGOs only' },
        { status: 403 }
      )
    }

    const result = await assembleGeneratedDocument(user, {
      documentType,
      campaignId: parsed.data.campaignId,
      projectId: parsed.data.projectId,
      period: parsed.data.period,
      periodStart: parsed.data.periodStart,
      periodEnd: parsed.data.periodEnd,
    })

    return NextResponse.json({
      success: true,
      documentType,
      filename: result.filename,
      label: result.label,
      entityTitle: 'entityTitle' in result ? result.entityTitle : undefined,
      html: result.html,
    })
  } catch (error: any) {
    const message = String(error?.message || 'Failed to generate document')
    const status =
      /required|select|not found|not owned|not assigned|only/i.test(message) ? 400 : 500
    if (status >= 500) {
      console.error('Document generation error:', error)
    }
    return NextResponse.json({ error: message }, { status })
  }
}
