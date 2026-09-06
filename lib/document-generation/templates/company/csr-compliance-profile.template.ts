import {
  buildDocumentReference,
  escapeHtml,
  formatDisplayDate,
  formatInr,
  renderGapsSection,
  renderSignatureBlock,
  wrapDocumentHtml,
} from '@/lib/document-generation/shared-layout'
import type { ImpactReportPeriod } from '@/lib/document-generation/types'

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


export type ImpactReportMilestone = {
  title: string
  status?: string | null
  budgetAllocated?: number | null
  dueDate?: string | null
  description?: string | null
}

export type ImpactReportData = {
  audienceLabel: string
  organizationName: string
  entityTitle: string
  entityTypeLabel: string
  period: ImpactReportPeriod
  periodLabel: string
  periodStart?: string | null
  periodEnd?: string | null
  category?: string | null
  location?: string | null
  scheduleVii?: string | null
  sdgAlignment?: string[] | null
  budgetInr?: number | null
  fundsUtilized?: number | null
  beneficiaries?: number | null
  progressPercentage?: number | null
  status?: string | null
  partnerName?: string | null
  partnerRole?: string | null
  description?: string | null
  implementingAgencyType?: string | null
  milestones?: ImpactReportMilestone[]
  customMetrics?: Record<string, unknown> | null
  evidenceCount?: number | null
  gaps?: string[]
}

function periodHeading(period: ImpactReportPeriod): string {
  if (period === 'quarterly') return 'Quarterly CSR Impact Report'
  if (period === 'annual') return 'Annual CSR Impact Report'
  return 'CSR Impact Report — Custom Period'
}

export function impactReportTemplate(data: ImpactReportData): string {
  const milestones = Array.isArray(data.milestones) ? data.milestones : []
  const sdgs = Array.isArray(data.sdgAlignment) ? data.sdgAlignment.filter(Boolean) : []
  const customEntries = data.customMetrics
    ? Object.entries(data.customMetrics).filter(([, value]) => value !== null && value !== undefined && value !== '')
    : []
  const ref = buildDocumentReference('CSR-IR', data.organizationName)

  const body = `
    ${renderGapsSection(data.gaps || [])}
    <div class="section">
      <div class="section-title">1. Executive Summary</div>
      <p class="section-intro">
        This impact report consolidates initiative performance, fund utilization, and milestone progress from GRAM records for board / CSR committee / funder review.
        Where Rule 8(3) independent impact assessment is mandated (average CSR obligation ≥ ₹10 crore and project outlay ≥ ₹1 crore), commission an independent agency; this document is a management working paper, not that assessment.
      </p>
      <div class="field-grid">
        <div class="field">
          <span class="field-label">Prepared For</span>
          <span class="field-value">${escapeHtml(data.audienceLabel)}</span>
        </div>
        <div class="field">
          <span class="field-label">Reporting Organization</span>
          <span class="field-value">${escapeHtml(data.organizationName || '—')}</span>
        </div>
        <div class="field">
          <span class="field-label">${escapeHtml(data.entityTypeLabel)}</span>
          <span class="field-value">${escapeHtml(data.entityTitle || '—')}</span>
        </div>
        <div class="field">
          <span class="field-label">Reporting Period</span>
          <span class="field-value">${escapeHtml(data.periodLabel)}</span>
        </div>
        <div class="field">
          <span class="field-label">Period Start</span>
          <span class="field-value">${escapeHtml(formatDisplayDate(data.periodStart))}</span>
        </div>
        <div class="field">
          <span class="field-label">Period End</span>
          <span class="field-value">${escapeHtml(formatDisplayDate(data.periodEnd))}</span>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">2. Project / Programme Particulars</div>
      <div class="field-grid">
        <div class="field">
          <span class="field-label">Sector / Category</span>
          <span class="field-value">${escapeHtml(data.category || '—')}</span>
        </div>
        <div class="field">
          <span class="field-label">Location</span>
          <span class="field-value">${escapeHtml(data.location || '—')}</span>
        </div>
        <div class="field">
          <span class="field-label">Schedule VII Item</span>
          <span class="field-value">${escapeHtml(data.scheduleVii || '—')}</span>
        </div>
        <div class="field">
          <span class="field-label">Status</span>
          <span class="field-value">${escapeHtml(data.status || '—')}</span>
        </div>
        <div class="field">
          <span class="field-label">${escapeHtml(data.partnerRole || 'Implementing Partner')}</span>
          <span class="field-value">${escapeHtml(data.partnerName || '—')}</span>
        </div>
        <div class="field">
          <span class="field-label">SDG Alignment</span>
          <span class="field-value">${escapeHtml(sdgs.length ? sdgs.join(', ') : '—')}</span>
        </div>
        <div class="field">
          <span class="field-label">Mode of Implementation</span>
          <span class="field-value">${escapeHtml(data.implementingAgencyType || 'Direct / Through implementing agency (as recorded)')}</span>
        </div>
        <div class="field">
          <span class="field-label">Evidence Items Logged</span>
          <span class="field-value">${escapeHtml(
            Number.isFinite(Number(data.evidenceCount)) ? String(data.evidenceCount) : '—'
          )}</span>
        </div>
      </div>
      ${
        data.description
          ? `<p class="muted" style="margin-top:12px">${escapeHtml(data.description)}</p>`
          : ''
      }
    </div>

    <div class="section">
      <div class="section-title">3. Outcomes &amp; Financial Snapshot</div>
      <div class="field-grid-3">
        <div class="metric-card">
          <div class="field-label">Approved Budget</div>
          <div class="field-value">${formatInr(data.budgetInr)}</div>
        </div>
        <div class="metric-card">
          <div class="field-label">Funds Utilized</div>
          <div class="field-value">${formatInr(data.fundsUtilized)}</div>
        </div>
        <div class="metric-card">
          <div class="field-label">Beneficiaries</div>
          <div class="field-value">${escapeHtml(
            Number.isFinite(Number(data.beneficiaries)) ? Number(data.beneficiaries).toLocaleString('en-IN') : '—'
          )}</div>
        </div>
      </div>
      <div class="field-grid" style="margin-top:12px">
        <div class="field">
          <span class="field-label">Progress</span>
          <span class="field-value">${escapeHtml(
            Number.isFinite(Number(data.progressPercentage)) ? `${Number(data.progressPercentage)}%` : '—'
          )}</span>
        </div>
      </div>
      ${
        customEntries.length
          ? `<table class="table" style="margin-top:14px">
              <thead><tr><th>Custom Metric</th><th>Value</th></tr></thead>
              <tbody>
                ${customEntries
                  .map(
                    ([key, value]) =>
                      `<tr><td>${escapeHtml(key)}</td><td>${escapeHtml(
                        typeof value === 'object' ? JSON.stringify(value) : value
                      )}</td></tr>`
                  )
                  .join('')}
              </tbody>
            </table>`
          : ''
      }
    </div>

    <div class="section">
      <div class="section-title">4. Milestone Tracker</div>
      ${
        milestones.length
          ? `<table class="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Milestone</th>
                  <th>Status</th>
                  <th>Budget Allocated</th>
                  <th>Due Date</th>
                </tr>
              </thead>
              <tbody>
                ${milestones
                  .map(
                    (milestone, index) => `
                  <tr>
                    <td>${index + 1}</td>
                    <td>${escapeHtml(milestone.title || 'Untitled')}${
                      milestone.description
                        ? `<div class="muted">${escapeHtml(milestone.description)}</div>`
                        : ''
                    }</td>
                    <td>${escapeHtml(milestone.status || '—')}</td>
                    <td>${formatInr(milestone.budgetAllocated)}</td>
                    <td>${escapeHtml(formatDisplayDate(milestone.dueDate))}</td>
                  </tr>`
                  )
                  .join('')}
              </tbody>
            </table>`
          : '<p class="muted">No milestones recorded for this initiative on the platform.</p>'
      }
    </div>
    ${renderSignatureBlock([
      { role: 'Prepared by (Programme / CSR Lead)', hint: 'Name / Designation / Date' },
      { role: 'Reviewed by (Finance / Partner)', hint: 'Name / Designation / Date' },
    ])}
  `

  return wrapDocumentHtml(
    {
      title: periodHeading(data.period),
      subtitle: `${data.entityTypeLabel}: ${data.entityTitle}`,
      documentCode: ref,
      referenceNumber: ref,
      classification: 'INTERNAL — IMPACT WORKING PAPER',
      rightMeta: data.periodLabel,
    },
    body
  )
}

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
          <div class="field-value">${formatInr(data.budgetInr)}</div>
        </div>
        <div class="metric-card">
          <div class="field-label">Amount Received (Confirmed)</div>
          <div class="field-value">${formatInr(data.fundsConfirmed)}</div>
        </div>
        <div class="metric-card">
          <div class="field-label">Amount Utilized</div>
          <div class="field-value">${formatInr(data.fundsUtilized)}</div>
        </div>
      </div>
      <div class="field-grid" style="margin-top:12px">
        <div class="field">
          <span class="field-label">Unutilized Balance (Received − Utilized)</span>
          <span class="field-value">${formatInr(balance)}</span>
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
                    <td>${formatInr(line.amount)}</td>
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
          <div class="field-value">${formatInr(data.averageNetProfit)}</div>
        </div>
        <div class="metric-card">
          <div class="field-label">Prescribed CSR (2%)</div>
          <div class="field-value">${formatInr(data.prescribedSpend2Pct)}</div>
        </div>
        <div class="metric-card">
          <div class="field-label">Amount Spent (GRAM tracked)</div>
          <div class="field-value">${formatInr(data.totalSpent)}</div>
        </div>
      </div>
      <div class="field-grid" style="margin-top:12px">
        <div class="field">
          <span class="field-label">Amount Unspent (computed if both figures available)</span>
          <span class="field-value">${formatInr(data.amountUnspent)}</span>
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
                    <td>${formatInr(project.amountSpent)}</td>
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

export type ImplementingAgencyReportData = {
  ngoName: string
  companyName?: string | null
  entityTitle: string
  entityTypeLabel: string
  registrationHints?: string[]
  location?: string | null
  scheduleVii?: string | null
  periodLabel?: string | null
  budgetInr?: number | null
  fundsReceived?: number | null
  fundsUtilized?: number | null
  beneficiaries?: number | null
  progressPercentage?: number | null
  milestones?: ImpactReportMilestone[]
  activitiesSummary?: string | null
  gaps?: string[]
}

export function implementingAgencyReportTemplate(data: ImplementingAgencyReportData): string {
  const milestones = Array.isArray(data.milestones) ? data.milestones : []
  const ref = buildDocumentReference('NGO-IAR', data.ngoName)
  const regs = data.registrationHints?.length
    ? `<ul style="margin-left:18px">${data.registrationHints.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
    : '<p class="muted">Add 12A / 80G / CSR-1 / FCRA status from the NGO Compliance Pack.</p>'

  const body = `
    ${renderGapsSection(data.gaps || [])}
    <div class="section">
      <div class="section-title">1. Implementing Agency Particulars</div>
      <p class="section-intro">
        Standard funder pack for CSR implementing agencies: identity, registration posture, programme delivery, and funds position.
        Attach scanned 12A / 80G / CSR-1 / FCRA certificates as issued by competent authorities.
      </p>
      <div class="field-grid">
        <div class="field">
          <span class="field-label">Implementing Agency</span>
          <span class="field-value">${escapeHtml(data.ngoName)}</span>
        </div>
        <div class="field">
          <span class="field-label">Funding Company</span>
          <span class="field-value">${escapeHtml(data.companyName || '—')}</span>
        </div>
        <div class="field">
          <span class="field-label">${escapeHtml(data.entityTypeLabel)}</span>
          <span class="field-value">${escapeHtml(data.entityTitle)}</span>
        </div>
        <div class="field">
          <span class="field-label">Period</span>
          <span class="field-value">${escapeHtml(data.periodLabel || 'As recorded')}</span>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">2. Registration / Eligibility Snapshot (Platform)</div>
      ${regs}
    </div>

    <div class="section">
      <div class="section-title">3. Programme Delivery</div>
      <div class="field-grid">
        <div class="field">
          <span class="field-label">Location</span>
          <span class="field-value">${escapeHtml(data.location || '—')}</span>
        </div>
        <div class="field">
          <span class="field-label">Schedule VII</span>
          <span class="field-value">${escapeHtml(data.scheduleVii || '—')}</span>
        </div>
        <div class="field">
          <span class="field-label">Beneficiaries</span>
          <span class="field-value">${escapeHtml(
            Number.isFinite(Number(data.beneficiaries)) ? Number(data.beneficiaries).toLocaleString('en-IN') : '—'
          )}</span>
        </div>
        <div class="field">
          <span class="field-label">Progress</span>
          <span class="field-value">${escapeHtml(
            Number.isFinite(Number(data.progressPercentage)) ? `${Number(data.progressPercentage)}%` : '—'
          )}</span>
        </div>
              </div>
      ${
        data.activitiesSummary
          ? `<p class="muted" style="margin-top:12px">${escapeHtml(data.activitiesSummary)}</p>`
          : ''
              }
            </div>

    <div class="section">
      <div class="section-title">4. Funds Position</div>
      <div class="field-grid-3">
        <div class="metric-card">
          <div class="field-label">Budget</div>
          <div class="field-value">${formatInr(data.budgetInr)}</div>
        </div>
        <div class="metric-card">
          <div class="field-label">Received</div>
          <div class="field-value">${formatInr(data.fundsReceived)}</div>
          </div>
        <div class="metric-card">
          <div class="field-label">Utilized</div>
          <div class="field-value">${formatInr(data.fundsUtilized)}</div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">5. Milestone Status</div>
      ${
        milestones.length
          ? `<table class="table">
              <thead><tr><th>#</th><th>Milestone</th><th>Status</th><th>Budget</th><th>Due</th></tr></thead>
              <tbody>
                ${milestones
                  .map(
                    (milestone, index) => `
                  <tr>
                    <td>${index + 1}</td>
                    <td>${escapeHtml(milestone.title || 'Untitled')}</td>
                    <td>${escapeHtml(milestone.status || '—')}</td>
                    <td>${formatInr(milestone.budgetAllocated)}</td>
                    <td>${escapeHtml(formatDisplayDate(milestone.dueDate))}</td>
                  </tr>`
                  )
                  .join('')}
              </tbody>
            </table>`
          : '<p class="muted">No milestones recorded.</p>'
      }
    </div>
    ${renderSignatureBlock([
      { role: 'Authorized Signatory (NGO)', hint: 'Name / Designation / Seal / Date' },
      { role: 'Project Coordinator', hint: 'Name / Date' },
    ])}
  `

  return wrapDocumentHtml(
    {
      title: 'Implementing Agency Project Report',
      subtitle: 'NGO delivery report for CSR funding partner',
      documentCode: ref,
      referenceNumber: ref,
      classification: 'CONFIDENTIAL — FUNDER PACK',
      rightMeta: data.entityTitle,
    },
    body
  )
}

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
