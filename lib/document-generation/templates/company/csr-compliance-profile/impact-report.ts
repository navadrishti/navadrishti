import {
  buildDocumentReference,
  escapeHtml,
  formatDisplayDate,
  renderGapsSection,
  renderSignatureBlock,
  wrapDocumentHtml,
} from '@/lib/document-generation/shared-layout'
import type { ImpactReportPeriod } from '@/lib/document-generation/types'
import { formatAmount, type ImpactReportMilestone } from './shared'

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
  sdgAlignment?: Array<string | number> | null
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
            data.evidenceCount != null && Number.isFinite(Number(data.evidenceCount)) ? String(data.evidenceCount) : '—'
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
          <div class="field-value">${formatAmount(data.budgetInr)}</div>
        </div>
        <div class="metric-card">
          <div class="field-label">Funds Utilized</div>
          <div class="field-value">${formatAmount(data.fundsUtilized)}</div>
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
                    <td>${formatAmount(milestone.budgetAllocated)}</td>
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
