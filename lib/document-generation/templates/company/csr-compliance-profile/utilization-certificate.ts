import {
  buildDocumentReference,
  escapeHtml,
  renderGapsSection,
  renderSignatureBlock,
  wrapDocumentHtml,
} from '@/lib/document-generation/shared-layout'
import { formatAmount } from './shared'

export type UtilizationCertificateData = {
  audienceLabel: string
  organizationName: string
  entityTitle: string
  entityTypeLabel: string
  certificateNo?: string | null
  funderName?: string | null
  implementerName?: string | null
  budgetInr?: number | null
  fundsUtilized?: number | null
  fundsConfirmed?: number | null
  currencyNote?: string | null
  periodLabel?: string | null
  status?: string | null
  scheduleVii?: string | null
  lineItems?: Array<{
    label: string
    amount?: number | null
    status?: string | null
    note?: string | null
  }>
  gaps?: string[]
}

export function utilizationCertificateTemplate(data: UtilizationCertificateData): string {
  const utilized = Number(data.fundsUtilized)
  const budget = Number(data.budgetInr)
  const confirmed = Number(data.fundsConfirmed)
  const balance =
    Number.isFinite(confirmed) && Number.isFinite(utilized) ? Math.max(confirmed - utilized, 0) : null
  const utilizationPct =
    Number.isFinite(utilized) && Number.isFinite(budget) && budget > 0
      ? `${((utilized / budget) * 100).toFixed(1)}%`
      : '—'
  const lines = Array.isArray(data.lineItems) ? data.lineItems : []
  const ref =
    data.certificateNo || buildDocumentReference('CSR-UC', data.organizationName)

  const body = `
    ${renderGapsSection(data.gaps || [])}
    <div class="section">
      <div class="section-title">1. Certificate Particulars</div>
      <p class="section-intro">
        Industry practice uses a utilization certificate (UC) as supporting evidence for CSR spend and implementing-agency reporting.
        This GRAM UC is a platform funds-utilization summary. Where a CA / statutory auditor signed UC is required by the funding company or auditor, obtain that separately.
      </p>
      <div class="field-grid">
        <div class="field">
          <span class="field-label">Certificate No.</span>
          <span class="field-value">${escapeHtml(ref)}</span>
        </div>
        <div class="field">
          <span class="field-label">Prepared For</span>
          <span class="field-value">${escapeHtml(data.audienceLabel)}</span>
        </div>
        <div class="field">
          <span class="field-label">Issuing Organization</span>
          <span class="field-value">${escapeHtml(data.organizationName || '—')}</span>
        </div>
        <div class="field">
          <span class="field-label">Currency</span>
          <span class="field-value">${escapeHtml(data.currencyNote || 'INR')}</span>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">2. Parties</div>
      <div class="field-grid">
        <div class="field">
          <span class="field-label">Funding Company</span>
          <span class="field-value">${escapeHtml(data.funderName || '—')}</span>
        </div>
        <div class="field">
          <span class="field-label">Implementing Agency / NGO</span>
          <span class="field-value">${escapeHtml(data.implementerName || '—')}</span>
        </div>
        <div class="field">
          <span class="field-label">${escapeHtml(data.entityTypeLabel)}</span>
          <span class="field-value">${escapeHtml(data.entityTitle || '—')}</span>
        </div>
        <div class="field">
          <span class="field-label">Schedule VII</span>
          <span class="field-value">${escapeHtml(data.scheduleVii || '—')}</span>
        </div>
        <div class="field">
          <span class="field-label">Status</span>
          <span class="field-value">${escapeHtml(data.status || '—')}</span>
        </div>
        <div class="field">
          <span class="field-label">Period Covered</span>
          <span class="field-value">${escapeHtml(data.periodLabel || 'As recorded on platform')}</span>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">3. Funds Position</div>
      <div class="field-grid-3">
        <div class="metric-card">
          <div class="field-label">Amount Sanctioned / Budgeted</div>
          <div class="field-value">${formatAmount(data.budgetInr)}</div>
        </div>
        <div class="metric-card">
          <div class="field-label">Amount Received (Confirmed)</div>
          <div class="field-value">${formatAmount(data.fundsConfirmed)}</div>
        </div>
        <div class="metric-card">
          <div class="field-label">Amount Utilized</div>
          <div class="field-value">${formatAmount(data.fundsUtilized)}</div>
        </div>
      </div>
      <div class="field-grid" style="margin-top:12px">
        <div class="field">
          <span class="field-label">Unutilized Balance (Received − Utilized)</span>
          <span class="field-value">${formatAmount(balance)}</span>
        </div>
        <div class="field">
          <span class="field-label">Utilization vs Budget</span>
          <span class="field-value">${escapeHtml(utilizationPct)}</span>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">4. Statement of Expenditure</div>
      ${
        lines.length
          ? `<table class="table">
              <thead>
                <tr><th>#</th><th>Particulars</th><th>Amount (₹)</th><th>Status</th><th>Reference</th></tr>
              </thead>
              <tbody>
                ${lines
                  .map(
                    (line, index) => `
                  <tr>
                    <td>${index + 1}</td>
                    <td>${escapeHtml(line.label)}</td>
                    <td>${formatAmount(line.amount)}</td>
                    <td>${escapeHtml(line.status || '—')}</td>
                    <td>${escapeHtml(line.note || '—')}</td>
                  </tr>`
                  )
                  .join('')}
              </tbody>
            </table>`
          : '<p class="muted">No payment / milestone line items were available. Summary figures above are taken from impact metrics and payment confirmations.</p>'
      }
    </div>

    <div class="section">
      <div class="section-title">5. Certification Language (Draft)</div>
      <p class="muted">
        Certified that the amounts shown above have been compiled from GRAM payment confirmations, milestone budgets,
        and impact metrics for the stated initiative. The undersigned confirms that the statement has been reviewed
        for internal / funder purposes. This does not constitute a statutory audit certificate.
      </p>
    </div>
    ${renderSignatureBlock([
      { role: 'Authorized Signatory (Implementing Agency / Company)', hint: 'Name / Designation / Date / Seal' },
      { role: 'Finance Countersignature', hint: 'CFO / Treasurer / Finance Head — Name / Date' },
    ])}
  `

  return wrapDocumentHtml(
    {
      title: 'CSR Funds Utilization Certificate',
      subtitle: 'Platform funds-utilization summary (supporting evidence)',
      documentCode: ref,
      referenceNumber: ref,
      classification: 'CONFIDENTIAL — FUNDER / AUDIT SUPPORTING',
      rightMeta: data.entityTitle || undefined,
    },
    body
  )
}
