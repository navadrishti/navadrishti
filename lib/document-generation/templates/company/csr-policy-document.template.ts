import {
  buildDocumentReference,
  escapeHtml,
  formatDisplayDate,
  renderGapsSection,
  renderSignatureBlock,
  wrapDocumentHtml,
} from '@/lib/document-generation/shared-layout'

export type CsrPolicyDocumentData = {
  companyName: string
  csrVision: string
  focusAreas: string[]
  implementationModel: string
  governingMechanism: string
  monitoringMechanism: string
  reportingFramework: string
  stakeholderEngagement: string
  grievanceRedressal: string
  reviewAndUpdate: string
  policyUrl?: string | null
  date?: string
  gaps?: string[]
}

export function csrPolicyDocumentTemplate(data: CsrPolicyDocumentData): string {
  const focus = data.focusAreas.length
    ? `<ul style="margin-left:18px">${data.focusAreas.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
    : '<p class="muted">No Schedule VII focus areas recorded on profile.</p>'

  const sections: Array<{ title: string; value: string }> = [
    { title: '2. CSR Vision & Objectives', value: data.csrVision },
    { title: '4. Implementation Model', value: data.implementationModel },
    { title: '5. Governance & CSR Committee Oversight', value: data.governingMechanism },
    { title: '6. Monitoring & Evaluation', value: data.monitoringMechanism },
    { title: '7. Reporting Framework', value: data.reportingFramework },
    { title: '8. Stakeholder Engagement', value: data.stakeholderEngagement },
    { title: '9. Grievance Redressal', value: data.grievanceRedressal },
    { title: '10. Review & Amendment', value: data.reviewAndUpdate },
  ]

  const ref = buildDocumentReference('CSR-POL', data.companyName)
  const body = `
    ${renderGapsSection(data.gaps || [])}
    <div class="section">
      <div class="section-title">1. Document Control</div>
      <div class="field-grid">
        <div class="field">
          <span class="field-label">Company</span>
          <span class="field-value">${escapeHtml(data.companyName || '—')}</span>
        </div>
        <div class="field">
          <span class="field-label">Policy Date</span>
          <span class="field-value">${escapeHtml(formatDisplayDate(data.date || new Date()))}</span>
        </div>
        <div class="field">
          <span class="field-label">Website Publication (Rule 9)</span>
          <span class="field-value">${escapeHtml(data.policyUrl || 'Add CSR Policy URL on company profile')}</span>
        </div>
        <div class="field">
          <span class="field-label">Regulatory Basis</span>
          <span class="field-value">Section 135 &amp; CSR Policy Rules, 2014</span>
        </div>
      </div>
    </div>
    <div class="section">
      <div class="section-title">3. Schedule VII Focus Areas</div>
      ${focus}
    </div>
    ${sections
      .map(
        (section) => `
      <div class="section">
        <div class="section-title">${escapeHtml(section.title)}</div>
        <p class="field-value">${escapeHtml(section.value || 'Not specified on platform profile — to be completed by the Board / CSR Committee.')}</p>
      </div>`
      )
      .join('')}
    ${renderSignatureBlock([
      { role: 'Chairperson, CSR Committee', hint: 'Name / Date' },
      { role: 'Managing Director / Director', hint: 'Name / Date' },
    ])}
  `

  return wrapDocumentHtml(
    {
      title: 'Corporate Social Responsibility Policy',
      subtitle: 'Board-facing policy draft assembled from platform profile',
      documentCode: ref,
      referenceNumber: ref,
      classification: 'BOARD WORKING DRAFT',
    },
    body
  )
}
