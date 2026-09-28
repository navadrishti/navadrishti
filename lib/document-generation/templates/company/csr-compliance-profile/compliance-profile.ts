import {
  buildDocumentReference,
  escapeHtml,
  renderGapsSection,
  renderSignatureBlock,
  wrapDocumentHtml,
} from '@/lib/document-generation/shared-layout'

export type CsrComplianceProfileData = {
  companyName: string
  cin: string
  pan: string
  registeredOffice?: string | null
  netWorth: number
  turnover: number
  netProfit: number
  csrApplicable: boolean
  financialYearLabel?: string | null
  gaps?: string[]
}

export function csrComplianceProfileTemplate(data: CsrComplianceProfileData): string {
  const formatCrore = (val: number) =>
    Number.isFinite(val) ? `₹${val.toLocaleString('en-IN')} Cr` : '—'

    const reasons: string[] = []
  if (data.netProfit >= 5) reasons.push('Net Profit ≥ ₹5 crore')
  if (data.netWorth >= 500) reasons.push('Net Worth ≥ ₹500 crore')
  if (data.turnover >= 1000) reasons.push('Turnover ≥ ₹1,000 crore')

  const ref = buildDocumentReference('CSR-CP', data.cin || data.companyName)
  const body = `
    ${renderGapsSection(data.gaps || [])}
        <div class="section">
      <div class="section-title">1. Company Identification</div>
      <p class="section-intro">Prepared with reference to Section 135 of the Companies Act, 2013 and the Companies (CSR Policy) Rules, 2014 (as amended).</p>
          <div class="field-grid">
            <div class="field">
              <span class="field-label">Company Name</span>
          <span class="field-value">${escapeHtml(data.companyName || '—')}</span>
            </div>
            <div class="field">
              <span class="field-label">CIN</span>
          <span class="field-value">${escapeHtml(data.cin || '—')}</span>
            </div>
            <div class="field">
              <span class="field-label">PAN</span>
          <span class="field-value">${escapeHtml(data.pan || '—')}</span>
        </div>
        <div class="field">
          <span class="field-label">Registered Office</span>
          <span class="field-value">${escapeHtml(data.registeredOffice || '—')}</span>
        </div>
        <div class="field">
          <span class="field-label">Financial Year Reference</span>
          <span class="field-value">${escapeHtml(data.financialYearLabel || 'Preceding financial year (as recorded)')}</span>
            </div>
          </div>
        </div>

        <div class="section">
      <div class="section-title">2. Threshold Financials (Section 135)</div>
      <div class="field-grid-3">
        <div class="metric-card">
              <div class="field-label">Net Worth</div>
              <div class="field-value">${formatCrore(data.netWorth)}</div>
            </div>
        <div class="metric-card">
              <div class="field-label">Turnover</div>
              <div class="field-value">${formatCrore(data.turnover)}</div>
            </div>
        <div class="metric-card">
              <div class="field-label">Net Profit</div>
              <div class="field-value">${formatCrore(data.netProfit)}</div>
            </div>
          </div>
        </div>

        <div class="section">
      <div class="section-title">3. CSR Applicability Determination</div>
      <p class="field-value">
        <span class="badge ${data.csrApplicable ? 'badge-ok' : 'badge-warn'}">
          ${data.csrApplicable ? 'CSR Applicable' : 'CSR Not Applicable'}
        </span>
      </p>
      <p class="muted" style="margin-top:10px">
        ${
          data.csrApplicable
            ? `Criteria met on platform figures — ${escapeHtml(reasons.join('; '))}.`
            : 'Based on figures currently stored on the platform, no Section 135 threshold appears to be met. Confirm with audited financials before board reliance.'
        }
      </p>
      <p class="muted" style="margin-top:8px">
        Where applicable, companies must constitute a CSR Committee (where required), adopt a CSR Policy, spend/transfer as prescribed, and report via Board’s Report Annexure II and Form CSR-2.
      </p>
    </div>
    ${renderSignatureBlock([
      { role: 'Company Authorized Signatory', hint: 'Director / Company Secretary — Name / Date' },
      { role: 'Finance Review', hint: 'CFO / Finance Head — Name / Date' },
    ])}
  `

  return wrapDocumentHtml(
    {
      title: 'CSR Compliance Profile',
      subtitle: 'Section 135 applicability working paper',
      documentCode: ref,
      referenceNumber: ref,
      classification: 'INTERNAL — COMPLIANCE WORKING PAPER',
      rightMeta: data.csrApplicable ? 'CSR Applicable' : 'CSR Not Applicable',
    },
    body
  )
}
