import {
  buildDocumentReference,
  escapeHtml,
  renderGapsSection,
  renderSignatureBlock,
  wrapDocumentHtml,
} from '@/lib/document-generation/shared-layout'
import { formatAmount } from './shared'

export type BoardCsrAnnexureDraftData = {
  companyName: string
  cin?: string | null
  financialYearLabel: string
  csrPolicyOutline?: string | null
  focusAreas: string[]
  websiteUrl?: string | null
  averageNetProfit?: number | null
  prescribedSpend2Pct?: number | null
  totalSpent?: number | null
  amountUnspent?: number | null
  projects: Array<{
    name: string
    scheduleVii?: string | null
    location?: string | null
    implementingAgency?: string | null
    amountSpent?: number | null
    status?: string | null
    mode?: string | null
  }>
  impactAssessmentNote?: string | null
  gaps?: string[]
}

export function boardCsrAnnexureDraftTemplate(data: BoardCsrAnnexureDraftData): string {
  const ref = buildDocumentReference('CSR-AX2', data.cin || data.companyName)
  const focus = data.focusAreas.length
    ? data.focusAreas.map((item) => escapeHtml(item)).join('; ')
    : '—'

  const body = `
    ${renderGapsSection(data.gaps || [])}
    <div class="section">
      <div class="section-title">Purpose &amp; Limitations</div>
      <p class="section-intro">
        Working draft aligned to <strong>Annexure II</strong> — Format for the Annual Report on CSR Activities
        (Companies (CSR Policy) Rules, 2014, for FYs commencing on or after 1 April 2020, as amended).
        Complete missing statutory fields (CSR Committee composition, exact average net profit, unspent transfers to Schedule VII funds,
        responsibility statement) offline before annexing to the Board’s Report. File Form CSR-2 separately with MCA — this document is not Form CSR-2.
      </p>
    </div>

    <div class="section">
      <div class="section-title">1. Brief Outline of CSR Policy</div>
      <div class="field-grid">
        <div class="field">
          <span class="field-label">Company</span>
          <span class="field-value">${escapeHtml(data.companyName)}</span>
        </div>
        <div class="field">
          <span class="field-label">CIN</span>
          <span class="field-value">${escapeHtml(data.cin || '—')}</span>
        </div>
        <div class="field">
          <span class="field-label">Financial Year</span>
          <span class="field-value">${escapeHtml(data.financialYearLabel)}</span>
        </div>
        <div class="field">
          <span class="field-label">CSR Policy / Projects Web-link (Rule 9)</span>
          <span class="field-value">${escapeHtml(data.websiteUrl || 'Publish on company website and record URL')}</span>
        </div>
      </div>
      <p class="field-value" style="margin-top:12px">${escapeHtml(
        data.csrPolicyOutline || 'Summarise CSR policy objectives from the approved Board policy.'
      )}</p>
      <p class="muted" style="margin-top:8px"><strong>Focus areas (Schedule VII):</strong> ${focus}</p>
    </div>

    <div class="section">
      <div class="section-title">2. Composition of CSR Committee</div>
      <p class="muted">Not stored as structured fields on GRAM yet. Insert Director names / DIN / Designation / Category from Board records.</p>
      <table class="table">
        <thead>
          <tr><th>Sl. No.</th><th>Name of Director</th><th>Designation / Nature of Directorship</th><th>Number of meetings held</th><th>Number of meetings attended</th></tr>
        </thead>
        <tbody>
          <tr><td>1</td><td></td><td></td><td></td><td></td></tr>
          <tr><td>2</td><td></td><td></td><td></td><td></td></tr>
          <tr><td>3</td><td></td><td></td><td></td><td></td></tr>
        </tbody>
      </table>
    </div>

    <div class="section">
      <div class="section-title">3. Financial Snapshot (Platform-Assisted)</div>
      <div class="field-grid-3">
        <div class="metric-card">
          <div class="field-label">Avg. Net Profit (3 yrs) — if entered</div>
          <div class="field-value">${formatAmount(data.averageNetProfit)}</div>
        </div>
        <div class="metric-card">
          <div class="field-label">Prescribed CSR (2%)</div>
          <div class="field-value">${formatAmount(data.prescribedSpend2Pct)}</div>
        </div>
        <div class="metric-card">
          <div class="field-label">Amount Spent (GRAM tracked)</div>
          <div class="field-value">${formatAmount(data.totalSpent)}</div>
        </div>
      </div>
      <div class="field-grid" style="margin-top:12px">
        <div class="field">
          <span class="field-label">Amount Unspent (computed if both figures available)</span>
          <span class="field-value">${formatAmount(data.amountUnspent)}</span>
        </div>
      </div>
      <p class="muted" style="margin-top:8px">Use audited Section 198 net profit for statutory 2% calculation. GRAM figures are operational trackers only.</p>
    </div>

    <div class="section">
      <div class="section-title">4. Details of CSR Amount Spent (from GRAM initiatives)</div>
      ${
        data.projects.length
          ? `<table class="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>CSR Project / Activity</th>
                  <th>Schedule VII</th>
                  <th>Location</th>
                  <th>Implementing Agency</th>
                  <th>Mode</th>
                  <th>Amount Spent (₹)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${data.projects
                  .map(
                    (project, index) => `
                  <tr>
                    <td>${index + 1}</td>
                    <td>${escapeHtml(project.name)}</td>
                    <td>${escapeHtml(project.scheduleVii || '—')}</td>
                    <td>${escapeHtml(project.location || '—')}</td>
                    <td>${escapeHtml(project.implementingAgency || '—')}</td>
                    <td>${escapeHtml(project.mode || '—')}</td>
                    <td>${formatAmount(project.amountSpent)}</td>
                    <td>${escapeHtml(project.status || '—')}</td>
                  </tr>`
                  )
                  .join('')}
              </tbody>
            </table>`
          : '<p class="muted">No campaign / project spend rows available on the platform for this company.</p>'
      }
    </div>

    <div class="section">
      <div class="section-title">5. Impact Assessment (Rule 8(3))</div>
      <p class="field-value">${escapeHtml(
        data.impactAssessmentNote ||
          'Applicable if average CSR obligation is ₹10 crore or more in the three preceding FYs for projects with outlay ≥ ₹1 crore completed ≥ 1 year before the study. Attach independent agency report when applicable.'
      )}</p>
    </div>

    <div class="section">
      <div class="section-title">6. Responsibility Statement (to be signed)</div>
      <p class="muted">
        The implementation and monitoring of the CSR Policy is in compliance with CSR objectives and Policy of the Company
        (to be confirmed by the CSR Committee and Board after review of complete statutory records).
      </p>
    </div>
    ${renderSignatureBlock([
      { role: 'Chief Executive Officer / Managing Director / Director', hint: 'Signature / Name / Date' },
      { role: 'Chairman, CSR Committee', hint: 'Signature / Name / Date' },
    ])}
  `

  return wrapDocumentHtml(
    {
      title: 'Annual Report on CSR Activities — Annexure II Draft',
      subtitle: 'Board’s Report working draft (not an MCA filing)',
      documentCode: ref,
      referenceNumber: ref,
      classification: 'BOARD WORKING DRAFT — ANNEXURE II ALIGNED',
      rightMeta: data.financialYearLabel,
    },
    body
  )
}
