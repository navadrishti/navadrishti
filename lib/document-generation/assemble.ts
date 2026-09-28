import 'server-only'
import type { UserData } from '@/lib/auth'
import type {
  DocumentTypeId,
  GenerateDocumentRequest,
  ImpactReportPeriod,
} from '@/lib/document-generation/types'
import { buildBoardAnnexureDraft, buildCompliance, buildPolicy } from './assemble/company-documents'
import { assembleImpactReport } from './assemble/impact-report'
import { loadUserRow } from './assemble/loaders'
import { assembleImplementingAgencyReport, buildNgoCompliancePack } from './assemble/ngo-documents'
import { assembleUtilizationCertificate } from './assemble/utilization-certificate'
import { asString } from './assemble/values'

export async function assembleGeneratedDocument(
  user: UserData,
  request: GenerateDocumentRequest
) {
  const documentType = request.documentType as DocumentTypeId
  const userRow = await loadUserRow(user.id)
  const organizationName = asString(userRow.name) || (user.user_type === 'ngo' ? 'NGO' : 'Company')

  if (documentType === 'csr_compliance_profile') {
    if (user.user_type !== 'company') throw new Error('CSR Compliance Profile is available to companies only')
    return buildCompliance(userRow)
  }

  if (documentType === 'csr_policy_document') {
    if (user.user_type !== 'company') throw new Error('CSR Policy Document is available to companies only')
    return buildPolicy(userRow)
  }

  if (documentType === 'board_csr_annexure_draft') {
    if (user.user_type !== 'company') throw new Error('Board Annexure II draft is available to companies only')
    return buildBoardAnnexureDraft(userRow, user.id)
  }

  if (documentType === 'ngo_compliance_pack') {
    if (user.user_type !== 'ngo') throw new Error('NGO Compliance Pack is available to NGOs only')
    return buildNgoCompliancePack(userRow)
  }

  const context = {
    user,
    request,
    userRow,
    organizationName,
    period: (request.period || 'annual') as ImpactReportPeriod,
  }

  if (documentType === 'implementing_agency_report') return assembleImplementingAgencyReport(context)
  if (documentType === 'impact_report') return assembleImpactReport(context)
  if (documentType === 'utilization_certificate') return assembleUtilizationCertificate(context)

  throw new Error('Unsupported document type')
}
