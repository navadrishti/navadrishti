import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  boardCsrAnnexureDraftTemplate,
  csrComplianceProfileTemplate,
  implementingAgencyReportTemplate,
  impactReportTemplate,
  ngoCompliancePackTemplate,
  utilizationCertificateTemplate,
  type ImpactReportData,
} from '@/lib/document-generation/templates/company/csr-compliance-profile'
import { csrPolicyDocumentTemplate } from '@/lib/document-generation/templates/company/csr-policy-document.template'
import { DOCUMENT_DISCLAIMER, escapeHtml, wrapDocumentHtml } from '@/lib/document-generation/shared-layout'
import { expectCleanOutput, fieldValue } from './support/documents-fixtures'

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-27T06:00:00.000Z'))
})

afterAll(() => {
  vi.useRealTimers()
})

const XSS = '<script>alert("x")</script>'

describe('wrapDocumentHtml', () => {
  it('renders chrome with escaped title and Indian date', () => {
    const html = wrapDocumentHtml({ title: 'A & B', subtitle: XSS, documentCode: 'DOC-1' }, '<p>body</p>')
    expect(html).toContain('<h1>A &amp; B</h1>')
    expect(html).toContain(escapeHtml(XSS))
    expect(html).not.toContain(XSS)
    expect(html).toContain('Generated: 27 September 2026')
    expect(html).toContain(escapeHtml(DOCUMENT_DISCLAIMER))
    expect(html).toContain('<p>body</p>')
  })
})

describe('csrComplianceProfileTemplate', () => {
  const base = {
    companyName: 'Acme',
    cin: 'L12345MH2000PLC123456',
    pan: 'AAACA1234A',
    registeredOffice: 'Mumbai',
    netWorth: 450,
    turnover: 1250.5,
    netProfit: 6,
    csrApplicable: true,
    financialYearLabel: 'FY 2026-27',
  }

  it('formats crore figures and applicability reasons', () => {
    const html = csrComplianceProfileTemplate(base)
    expect(fieldValue(html, 'Net Worth')).toBe('₹450 Cr')
    expect(fieldValue(html, 'Turnover')).toBe('₹1,250.5 Cr')
    expect(fieldValue(html, 'Net Profit')).toBe('₹6 Cr')
    expect(fieldValue(html, 'CIN')).toBe(base.cin)
    expect(fieldValue(html, 'Financial Year Reference')).toBe('FY 2026-27')
    expect(html).toContain('Criteria met on platform figures — Net Profit ≥ ₹5 crore; Turnover ≥ ₹1,000 crore.')
    expect(html).toContain('CSR-CP/L12345MH2000/20260927')
    expectCleanOutput(html)
  })

  it('explains when no threshold is met', () => {
    const html = csrComplianceProfileTemplate({ ...base, netProfit: 1, csrApplicable: false })
    expect(html).toContain('CSR Not Applicable')
    expect(html).toContain('no Section 135 threshold appears to be met')
  })

  it('escapes user text and lists gaps', () => {
    const html = csrComplianceProfileTemplate({ ...base, companyName: XSS, registeredOffice: null, gaps: ['PAN <missing>'] })
    expect(html).not.toContain(XSS)
    expect(fieldValue(html, 'Company Name')).toBe(escapeHtml(XSS))
    expect(fieldValue(html, 'Registered Office')).toBe('—')
    expect(html).toContain('<li>PAN &lt;missing&gt;</li>')
  })
})

describe('csrPolicyDocumentTemplate', () => {
  const base = {
    companyName: 'Acme',
    csrVision: 'Water for all',
    focusAreas: ['Sanitation', XSS],
    implementationModel: '',
    governingMechanism: '',
    monitoringMechanism: '',
    reportingFramework: '',
    stakeholderEngagement: '',
    grievanceRedressal: '',
    reviewAndUpdate: '',
    date: '2026-04-01T00:00:00.000Z',
  }

  it('renders policy date, focus areas and placeholders', () => {
    const html = csrPolicyDocumentTemplate(base)
    expect(fieldValue(html, 'Policy Date')).toBe('01 April 2026')
    expect(fieldValue(html, 'Website Publication (Rule 9)')).toBe('Add CSR Policy URL on company profile')
    expect(html).toContain('<li>Sanitation</li>')
    expect(html).not.toContain(XSS)
    expect(html).toContain('Water for all')
    expect(html.match(/Not specified on platform profile/g)).toHaveLength(7)
    expectCleanOutput(html)
  })

  it('notes missing focus areas', () => {
    const html = csrPolicyDocumentTemplate({ ...base, focusAreas: [], policyUrl: 'https://acme.example' })
    expect(html).toContain('No Schedule VII focus areas recorded on profile.')
    expect(fieldValue(html, 'Website Publication (Rule 9)')).toBe('https://acme.example')
  })
})

describe('impactReportTemplate', () => {
  const full: ImpactReportData = {
    audienceLabel: 'Board',
    organizationName: 'Acme',
    entityTitle: 'Clean Water',
    entityTypeLabel: 'Campaign',
    period: 'custom',
    periodLabel: 'Custom (2026-04-01 → 2026-06-30)',
    periodStart: '2026-04-01',
    periodEnd: '2026-06-30',
    sdgAlignment: [6, 13],
    budgetInr: 500000,
    fundsUtilized: 123456.5,
    beneficiaries: 12345,
    progressPercentage: 40,
    partnerName: 'Seva & Co',
    description: XSS,
    milestones: [{ title: 'Survey', status: 'done', budgetAllocated: 200000, dueDate: '2026-10-15', description: 'Map <wells>' }],
    customMetrics: { wells: 4, detail: { depth: '<90m>' }, empty: '' },
    evidenceCount: 3,
  }

  it('formats amounts, counts and dates', () => {
    const html = impactReportTemplate(full)
    expect(fieldValue(html, 'Approved Budget')).toBe('₹5,00,000')
    expect(fieldValue(html, 'Funds Utilized')).toBe('₹1,23,456.5')
    expect(fieldValue(html, 'Beneficiaries')).toBe('12,345')
    expect(fieldValue(html, 'Progress')).toBe('40%')
    expect(fieldValue(html, 'Period Start')).toBe('01 April 2026')
    expect(fieldValue(html, 'Period End')).toBe('30 June 2026')
    expect(fieldValue(html, 'SDG Alignment')).toBe('6, 13')
    expect(fieldValue(html, 'Implementing Partner')).toBe('Seva &amp; Co')
    expect(fieldValue(html, 'Evidence Items Logged')).toBe('3')
    expect(html).toContain('<td>₹2,00,000</td>')
    expect(html).toContain('<td>15 October 2026</td>')
    expect(html).toContain('<div class="muted">Map &lt;wells&gt;</div>')
    expect(html).toContain('<td>wells</td><td>4</td>')
    expect(html).toContain(`<td>${escapeHtml(JSON.stringify({ depth: '<90m>' }))}</td>`)
    expect(html).not.toContain('<td>empty</td>')
    expect(html).not.toContain(XSS)
    expectCleanOutput(html)
  })

  it('handles missing data without leaking placeholders', () => {
    const html = impactReportTemplate({
      audienceLabel: 'Board',
      organizationName: '',
      entityTitle: '',
      entityTypeLabel: 'Campaign',
      period: 'annual',
      periodLabel: 'Annual',
      evidenceCount: null,
      customMetrics: null,
    })
    expect(fieldValue(html, 'Approved Budget')).toBe('—')
    expect(fieldValue(html, 'Beneficiaries')).toBe('—')
    expect(fieldValue(html, 'Progress')).toBe('—')
    expect(fieldValue(html, 'Evidence Items Logged')).toBe('—')
    expect(fieldValue(html, 'Period Start')).toBe('—')
    expect(html).toContain('No milestones recorded for this initiative on the platform.')
    expectCleanOutput(html)
  })

  it.each([
    ['quarterly', 'Quarterly CSR Impact Report'],
    ['annual', 'Annual CSR Impact Report'],
    ['custom', 'CSR Impact Report — Custom Period'],
  ] as const)('uses the %s heading', (period, heading) => {
    expect(impactReportTemplate({ ...full, period })).toContain(`<h1>${heading}</h1>`)
  })
})

describe('utilizationCertificateTemplate', () => {
  const base = { audienceLabel: 'Finance', organizationName: 'Acme', entityTitle: 'Wells', entityTypeLabel: 'CSR Project' }

  it.each([
    [200000, 150000, 500000, '₹50,000', '30.0%'],
    [100000, 150000, 500000, '₹0', '30.0%'],
    [100000, 50000, 0, '₹50,000', '—'],
    [undefined, 1000, 4000, '—', '25.0%'],
  ])('confirmed %s, utilized %s, budget %s -> balance %s, %s', (confirmed, utilized, budget, balance, pct) => {
    const html = utilizationCertificateTemplate({ ...base, fundsConfirmed: confirmed, fundsUtilized: utilized, budgetInr: budget })
    expect(fieldValue(html, 'Unutilized Balance (Received − Utilized)')).toBe(balance)
    expect(fieldValue(html, 'Utilization vs Budget')).toBe(pct)
    expectCleanOutput(html)
  })

  it('lists line items and uses a given certificate number', () => {
    const html = utilizationCertificateTemplate({
      ...base,
      certificateNo: 'UC-9',
      funderName: XSS,
      lineItems: [
        { label: 'Payment 1', amount: 200000, status: 'confirmed', note: 'UTR-1' },
        { label: 'Payment 2', amount: null, status: null, note: null },
      ],
    })
    expect(fieldValue(html, 'Certificate No.')).toBe('UC-9')
    expect(fieldValue(html, 'Funding Company')).toBe(escapeHtml(XSS))
    expect(fieldValue(html, 'Period Covered')).toBe('As recorded on platform')
    expect(html).toContain('<td>₹2,00,000</td>')
    expect(html).toContain('<td>UTR-1</td>')
    expect(html.match(/<td>—<\/td>/g)).toHaveLength(3)
    expectCleanOutput(html)
  })

  it('explains an empty statement of expenditure', () => {
    expect(utilizationCertificateTemplate(base)).toContain('No payment / milestone line items were available.')
  })
})

describe('boardCsrAnnexureDraftTemplate', () => {
  const base = { companyName: 'Acme', financialYearLabel: 'FY 2026-27', focusAreas: [] as string[], projects: [] }

  it('shows a dash for figures that are not available', () => {
    const html = boardCsrAnnexureDraftTemplate({
      ...base,
      averageNetProfit: null,
      prescribedSpend2Pct: null,
      totalSpent: null,
      amountUnspent: null,
    })
    expect(fieldValue(html, 'Avg. Net Profit (3 yrs) — if entered')).toBe('—')
    expect(fieldValue(html, 'Prescribed CSR (2%)')).toBe('—')
    expect(fieldValue(html, 'Amount Spent (GRAM tracked)')).toBe('—')
    expect(fieldValue(html, 'Amount Unspent (computed if both figures available)')).toBe('—')
    expect(html).toContain('No campaign / project spend rows available')
    expectCleanOutput(html)
  })

  it('renders figures and project rows', () => {
    const html = boardCsrAnnexureDraftTemplate({
      ...base,
      cin: 'L1',
      focusAreas: ['Water', XSS],
      averageNetProfit: 10000000,
      prescribedSpend2Pct: 200000,
      totalSpent: 150000,
      amountUnspent: 50000,
      projects: [{ name: XSS, amountSpent: 150000, status: 'active', mode: 'Direct / as recorded' }],
    })
    expect(fieldValue(html, 'Avg. Net Profit (3 yrs) — if entered')).toBe('₹1,00,00,000')
    expect(fieldValue(html, 'Amount Unspent (computed if both figures available)')).toBe('₹50,000')
    expect(html).toContain(`<td>${escapeHtml(XSS)}</td>`)
    expect(html).toContain(`Water; ${escapeHtml(XSS)}`)
    expect(html).toContain('<td>₹1,50,000</td>')
    expect(html).not.toContain(XSS)
  })
})

describe('implementingAgencyReportTemplate', () => {
  it('renders funds with a dash for unknown receipts', () => {
    const html = implementingAgencyReportTemplate({
      ngoName: 'Seva',
      entityTitle: 'Clean Water',
      entityTypeLabel: 'Lead Campaign',
      budgetInr: 500000,
      fundsReceived: null,
      fundsUtilized: 1000,
      beneficiaries: 1500,
      progressPercentage: 25,
      registrationHints: ['12A recorded on GRAM'],
      milestones: [{ title: 'Survey', dueDate: '2026-10-15', budgetAllocated: 5000 }],
    })
    expect(fieldValue(html, 'Budget')).toBe('₹5,00,000')
    expect(fieldValue(html, 'Received')).toBe('—')
    expect(fieldValue(html, 'Utilized')).toBe('₹1,000')
    expect(fieldValue(html, 'Beneficiaries')).toBe('1,500')
    expect(fieldValue(html, 'Funding Company')).toBe('—')
    expect(html).toContain('<li>12A recorded on GRAM</li>')
    expect(html).toContain('<td>15 October 2026</td>')
    expectCleanOutput(html)
  })

  it('prompts for registrations when none are recorded', () => {
    const html = implementingAgencyReportTemplate({ ngoName: XSS, entityTitle: 'X', entityTypeLabel: 'CSR Project' })
    expect(html).toContain('Add 12A / 80G / CSR-1 / FCRA status')
    expect(html).toContain('No milestones recorded.')
    expect(html).not.toContain(XSS)
    expectCleanOutput(html)
  })
})

describe('ngoCompliancePackTemplate', () => {
  it('marks recorded and missing tags', () => {
    const html = ngoCompliancePackTemplate({
      ngoName: 'Seva',
      email: 'a@b.org',
      tags: [
        { key: 'twelve_a', label: '12A', present: true, detail: 'Valid until 2027-03-31' },
        { key: 'fcra', label: 'FCRA', present: false, detail: null },
      ],
      documentExpirySummary: 'Soonest expiry: <12A>',
    })
    expect(html.match(/badge-ok">Recorded/g)).toHaveLength(1)
    expect(html.match(/badge-warn">Missing/g)).toHaveLength(1)
    expect(html).toContain('<td>Valid until 2027-03-31</td>')
    expect(html).toContain('Soonest expiry: &lt;12A&gt;')
    expect(fieldValue(html, 'Platform Verification Status')).toBe('—')
    expectCleanOutput(html)
  })
})
