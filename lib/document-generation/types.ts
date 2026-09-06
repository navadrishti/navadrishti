export type DocumentAudience = 'company' | 'ngo'

export type ImpactReportPeriod = 'quarterly' | 'annual' | 'custom'

export type DocumentTypeId =
  | 'impact_report'
  | 'csr_compliance_profile'
  | 'csr_policy_document'
  | 'utilization_certificate'
  | 'board_csr_annexure_draft'
  | 'implementing_agency_report'
  | 'ngo_compliance_pack'

export type GenerateDocumentRequest = {
  documentType: DocumentTypeId
  campaignId?: string | null
  projectId?: string | null
  period?: ImpactReportPeriod | null
  periodStart?: string | null
  periodEnd?: string | null
}

export type DocumentHistoryItem = {
  id: string
  documentType: DocumentTypeId
  filename: string
  label: string
  createdAt: string
  entityTitle?: string
}

export const COMPANY_DOCUMENT_OPTIONS: Array<{
  value: DocumentTypeId
  label: string
  needsEntity: boolean
}> = [
  { value: 'impact_report', label: 'Impact Report', needsEntity: true },
  { value: 'csr_compliance_profile', label: 'CSR Compliance Profile', needsEntity: false },
  { value: 'csr_policy_document', label: 'CSR Policy Document', needsEntity: false },
  { value: 'board_csr_annexure_draft', label: 'Board Annexure II Draft (Annual CSR Report)', needsEntity: false },
  { value: 'utilization_certificate', label: 'Utilization Certificate', needsEntity: true },
]

export const NGO_DOCUMENT_OPTIONS: Array<{
  value: DocumentTypeId
  label: string
  needsEntity: boolean
}> = [
  { value: 'impact_report', label: 'Project / Campaign Impact Report', needsEntity: true },
  { value: 'implementing_agency_report', label: 'Implementing Agency Project Report', needsEntity: true },
  { value: 'utilization_certificate', label: 'Utilization Certificate', needsEntity: true },
  { value: 'ngo_compliance_pack', label: 'NGO Compliance Status Pack (12A / 80G / CSR-1 / FCRA)', needsEntity: false },
]

export const IMPACT_PERIOD_OPTIONS: Array<{ value: ImpactReportPeriod; label: string }> = [
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual', label: 'Annual' },
  { value: 'custom', label: 'Custom Period' },
]
