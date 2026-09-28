import {
  buildDocumentReference,
  escapeHtml,
  renderGapsSection,
  renderSignatureBlock,
  wrapDocumentHtml,
} from '@/lib/document-generation/shared-layout'

export type NgoCompliancePackData = {
  ngoName: string
  verificationStatus?: string | null
  email?: string | null
  location?: string | null
  caBadgeNumber?: string | null
  tags: Array<{ key: string; label: string; present: boolean; detail?: string | null }>
  documentExpirySummary?: string | null
  gaps?: string[]
}

export function ngoCompliancePackTemplate(data: NgoCompliancePackData): string {
  const ref = buildDocumentReference('NGO-COMP', data.ngoName)
  const body = `
    ${renderGapsSection(data.gaps || [])}
    <div class="section">
      <div class="section-title">1. Organization Snapshot</div>
      <p class="section-intro">
        CSR funding companies typically require implementing agencies to evidence 12A, 80G, and CSR-1 registration (and FCRA where foreign contribution is involved).
        This pack summarises verification status stored on GRAM. Original certificates remain the statutory source of truth.
      </p>
      <div class="field-grid">
        <div class="field">
          <span class="field-label">NGO Name</span>
          <span class="field-value">${escapeHtml(data.ngoName)}</span>
        </div>
        <div class="field">
          <span class="field-label">Platform Verification Status</span>
          <span class="field-value">${escapeHtml(data.verificationStatus || '—')}</span>
        </div>
        <div class="field">
          <span class="field-label">Contact Email</span>
          <span class="field-value">${escapeHtml(data.email || '—')}</span>
        </div>
        <div class="field">
          <span class="field-label">Location</span>
          <span class="field-value">${escapeHtml(data.location || '—')}</span>
        </div>
        <div class="field">
          <span class="field-label">CA Badge (if issued)</span>
          <span class="field-value">${escapeHtml(data.caBadgeNumber || '—')}</span>
        </div>
          </div>
        </div>

    <div class="section">
      <div class="section-title">2. Statutory Registration Tags on Platform</div>
      <table class="table">
        <thead>
          <tr><th>Document / Tag</th><th>Present on GRAM</th><th>Detail / Expiry</th></tr>
        </thead>
        <tbody>
          ${data.tags
            .map(
              (tag) => `
            <tr>
              <td>${escapeHtml(tag.label)}</td>
              <td><span class="badge ${tag.present ? 'badge-ok' : 'badge-warn'}">${
                tag.present ? 'Recorded' : 'Missing'
              }</span></td>
              <td>${escapeHtml(tag.detail || '—')}</td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
      ${
        data.documentExpirySummary
          ? `<p class="muted" style="margin-top:10px">${escapeHtml(data.documentExpirySummary)}</p>`
          : ''
      }
        </div>

    <div class="section">
      <div class="section-title">3. Recommended Attachments</div>
      <ul style="margin-left:18px" class="muted">
        <li>CSR-1 registration acknowledgement / certificate (MCA)</li>
        <li>12A registration and 80G approval letters</li>
        <li>FCRA registration (if applicable)</li>
        <li>Latest audited financial statements and annual report</li>
        <li>Cancelled cheque / bank details for CSR remittance</li>
      </ul>
    </div>
    ${renderSignatureBlock([
      { role: 'Authorized Signatory (NGO)', hint: 'Name / Designation / Seal / Date' },
      { role: 'Compliance Custodian', hint: 'Name / Date' },
    ])}
  `

  return wrapDocumentHtml(
    {
      title: 'NGO CSR Compliance Status Pack',
      subtitle: '12A / 80G / CSR-1 / FCRA posture from platform records',
      documentCode: ref,
      referenceNumber: ref,
      classification: 'CONFIDENTIAL — DUE DILIGENCE PACK',
    },
    body
  )
}
