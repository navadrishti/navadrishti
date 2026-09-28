import {
  buildDocumentReference,
  escapeHtml,
  formatDisplayDate,
  renderGapsSection,
  renderSignatureBlock,
  wrapDocumentHtml,
} from '@/lib/document-generation/shared-layout'
import { formatAmount, type ImpactReportMilestone } from './shared'

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
          <div class="field-value">${formatAmount(data.budgetInr)}</div>
        </div>
        <div class="metric-card">
          <div class="field-label">Received</div>
          <div class="field-value">${formatAmount(data.fundsReceived)}</div>
          </div>
        <div class="metric-card">
          <div class="field-label">Utilized</div>
          <div class="field-value">${formatAmount(data.fundsUtilized)}</div>
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
                    <td>${formatAmount(milestone.budgetAllocated)}</td>
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
