import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserData } from '@/lib/auth'
import { assembleGeneratedDocument } from '@/lib/document-generation/assemble'
import type { GenerateDocumentRequest } from '@/lib/document-generation/types'
import { supabaseFake } from './campaign-supabase-fake'
import { campaign, db, expectCleanOutput, fieldValue, projects, resetDb, respond } from './documents-fixtures'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', async () => {
  const { supabaseFake: fake } = await import('./campaign-supabase-fake')
  return { supabase: fake.client }
})

const company: UserData = { id: 3, email: 'csr@acme.com', name: 'Acme', user_type: 'company' }
const rival: UserData = { id: 40, email: 'x@rival.com', name: 'Rival', user_type: 'company' }
const ngo: UserData = { id: 12, email: 'hello@seva.org', name: 'Seva', user_type: 'ngo' }
const otherNgo: UserData = { id: 13, email: 'o@ngo.org', name: 'Other', user_type: 'ngo' }

const generate = (user: UserData, request: Omit<Partial<GenerateDocumentRequest>, 'documentType'> & { documentType: string }) =>
  assembleGeneratedDocument(user, request as GenerateDocumentRequest)

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-27T06:00:00.000Z'))
})

afterAll(() => {
  vi.useRealTimers()
})

beforeEach(() => {
  supabaseFake.reset()
  supabaseFake.respondWith(respond)
  resetDb()
})

describe('document access by organization type', () => {
  it.each([
    [company, 'ngo_compliance_pack', 'NGO Compliance Pack is available to NGOs only'],
    [company, 'implementing_agency_report', 'Implementing Agency Report is available to NGOs only'],
    [ngo, 'csr_compliance_profile', 'CSR Compliance Profile is available to companies only'],
    [ngo, 'csr_policy_document', 'CSR Policy Document is available to companies only'],
    [ngo, 'board_csr_annexure_draft', 'Board Annexure II draft is available to companies only'],
    [company, 'board_minutes', 'Unsupported document type'],
  ])('%#: rejects %s', async (user, documentType, error) => {
    await expect(generate(user, { documentType })).rejects.toThrow(error)
  })

  it('fails when the organization profile is missing', async () => {
    await expect(generate({ ...company, id: 999 }, { documentType: 'csr_policy_document' })).rejects.toThrow(
      'Unable to load organization profile'
    )
  })
})

describe('company profile documents', () => {
  it('builds the compliance profile from profile data', async () => {
    const result = await generate(company, { documentType: 'csr_compliance_profile' })
    expect(result.filename).toBe('acme-industries-csr-compliance-profile.html')
    expect(result.label).toBe('CSR Compliance Profile')
    expect(fieldValue(result.html, 'Company Name')).toBe('Acme &lt;Industries&gt;')
    expect(fieldValue(result.html, 'Financial Year Reference')).toBe('FY 2026-27')
    expect(result.html).toContain('CSR Applicable')
    expect(result.html).not.toContain('Data Completeness Notes')
    expectCleanOutput(result.html)
  })

  it('lists gaps for an empty profile', async () => {
    const result = await generate(rival, { documentType: 'csr_compliance_profile' })
    expect(fieldValue(result.html, 'CIN')).toBe('Not provided')
    expect(fieldValue(result.html, 'Net Worth')).toBe('₹0 Cr')
    for (const gap of ['CIN missing', 'PAN missing', 'Financial figures', 'Registered office address missing']) {
      expect(result.html).toContain(gap)
    }
    expect(result.html).toContain('CSR Not Applicable')
    expectCleanOutput(result.html)
  })

  it('builds the policy document', async () => {
    const complete = await generate(company, { documentType: 'csr_policy_document' })
    expect(complete.filename).toBe('acme-industries-csr-policy.html')
    expect(complete.html).toContain('<li>Education &amp; &lt;Skills&gt;</li>')
    expect(fieldValue(complete.html, 'Policy Date')).toBe('27 September 2026')
    expect(complete.html).not.toContain('Data Completeness Notes')

    const empty = await generate(rival, { documentType: 'csr_policy_document' })
    for (const gap of ['CSR vision missing', 'Focus areas missing', 'Website / CSR Policy URL missing']) {
      expect(empty.html).toContain(gap)
    }
    expectCleanOutput(empty.html)
  })
})

describe('board annexure draft', () => {
  it('totals project spend against the 2% obligation', async () => {
    const result = await generate(company, { documentType: 'board_csr_annexure_draft' })
    expect(result.filename).toBe('acme-industries-board-csr-annexure-ii-draft.html')
    expect(fieldValue(result.html, 'Avg. Net Profit (3 yrs) — if entered')).toBe('₹1,00,00,000')
    expect(fieldValue(result.html, 'Prescribed CSR (2%)')).toBe('₹2,00,000')
    expect(fieldValue(result.html, 'Amount Spent (GRAM tracked)')).toBe('₹2,00,000')
    expect(fieldValue(result.html, 'Amount Unspent (computed if both figures available)')).toBe('₹0')
    expect(fieldValue(result.html, 'Financial Year')).toBe('FY 2026-27')
    expect(result.html).toContain('<td>Wells</td>')
    expect(result.html).toContain('<td>Seva Trust</td>')
    expect(result.html).toContain('<td>Other NGO</td>')
    expect(result.html).toContain('<td>₹1,50,000</td>')
    expect(result.html).toContain('No tracked initiative currently shows ≥ ₹1 crore utilization')
    expectCleanOutput(result.html)
  })

  it('falls back to campaigns when there are no projects', async () => {
    db.projects = []
    const result = await generate(company, { documentType: 'board_csr_annexure_draft' })
    expect(result.html).toContain('<td>Clean Water &amp; Sanitation</td>')
    expect(result.html).toContain('<td>Through implementing agency</td>')
    expect(fieldValue(result.html, 'Amount Spent (GRAM tracked)')).toBe('—')
    expect(fieldValue(result.html, 'Amount Unspent (computed if both figures available)')).toBe('₹2,00,000')
    expectCleanOutput(result.html)
  })

  it('flags missing inputs for an empty company', async () => {
    const result = await generate(rival, { documentType: 'board_csr_annexure_draft' })
    expect(fieldValue(result.html, 'Avg. Net Profit (3 yrs) — if entered')).toBe('—')
    expect(fieldValue(result.html, 'Prescribed CSR (2%)')).toBe('—')
    expect(result.html).toContain('No campaigns or projects found to list under CSR amount spent')
    expect(result.html).toContain('CIN missing')
    expectCleanOutput(result.html)
  })

  it('suggests an impact assessment for crore-scale projects', async () => {
    db.projects = [{ ...projects[0], csr_impact_metrics: [{ funds_utilized: 12500000, last_updated: '2026-09-01' }] }]
    const result = await generate(company, { documentType: 'board_csr_annexure_draft' })
    expect(result.html).toContain('One or more tracked initiatives show utilization ≥ ₹1 crore')
    expect(result.html).toContain('<td>₹1,25,00,000</td>')
  })
})

describe('impact report', () => {
  it('aggregates linked projects for a company campaign', async () => {
    const result = await generate(company, { documentType: 'impact_report', campaignId: 'c1' })
    expect(result.label).toBe('Annual Impact Report')
    expect(result.filename).toBe('acme-industries-impact-annual-clean-water-sanitation.html')
    expect('entityTitle' in result && result.entityTitle).toBe('Clean Water & Sanitation')
    expect(fieldValue(result.html, 'Funds Utilized')).toBe('₹2,00,000')
    expect(fieldValue(result.html, 'Beneficiaries')).toBe('350')
    expect(fieldValue(result.html, 'Progress')).toBe('40%')
    expect(fieldValue(result.html, 'Approved Budget')).toBe('₹5,00,000')
    expect(fieldValue(result.html, 'Implementing Partner')).toBe('Seva Trust')
    expect(fieldValue(result.html, 'Period Start')).toBe('27 September 2025')
    expect(fieldValue(result.html, 'Period End')).toBe('27 September 2026')
    expect(result.html).toContain('Borewells for &lt;b&gt;three&lt;/b&gt; villages')
    expectCleanOutput(result.html)
  })

  it('falls back to campaign metrics without projects', async () => {
    db.projects = []
    db.campaigns = [{ ...campaign, impact_metrics: { funds_utilized: 7500, beneficiaries: 20, progress_percentage: 15 } }]
    const result = await generate(company, { documentType: 'impact_report', campaignId: 'c1' })
    expect(fieldValue(result.html, 'Funds Utilized')).toBe('₹7,500')
    expect(fieldValue(result.html, 'Beneficiaries')).toBe('20')
    expect(fieldValue(result.html, 'Progress')).toBe('15%')
    expect(result.html).toContain('No linked CSR projects yet')
  })

  it('does not add campaign-level figures on top of project totals', async () => {
    db.campaigns = [{ ...campaign, impact_metrics: { funds_utilized: 7500, beneficiaries: 20 } }]
    const result = await generate(company, { documentType: 'impact_report', campaignId: 'c1' })
    expect(fieldValue(result.html, 'Funds Utilized')).toBe('₹2,00,000')
    expect(fieldValue(result.html, 'Beneficiaries')).toBe('350')
  })

  it('computes default period bounds in IST', async () => {
    vi.setSystemTime(new Date('2026-09-26T19:00:00.000Z'))
    try {
      const result = await generate(company, { documentType: 'impact_report', campaignId: 'c1', period: 'quarterly' })
      expect(fieldValue(result.html, 'Period Start')).toBe('27 June 2026')
      expect(fieldValue(result.html, 'Period End')).toBe('27 September 2026')
    } finally {
      vi.setSystemTime(new Date('2026-09-27T06:00:00.000Z'))
    }
  })

  it('uses custom period dates', async () => {
    const result = await generate(company, {
      documentType: 'impact_report',
      campaignId: 'c1',
      period: 'custom',
      periodStart: '2026-04-01',
      periodEnd: '2026-06-30',
    })
    expect(fieldValue(result.html, 'Reporting Period')).toBe('Custom (2026-04-01 → 2026-06-30)')
    expect(fieldValue(result.html, 'Period End')).toBe('30 June 2026')
  })

  it('reports a single project for an NGO', async () => {
    const result = await generate(ngo, { documentType: 'impact_report', projectId: 'p1' })
    expect(result.label).toBe('Project Impact Report')
    expect(fieldValue(result.html, 'Funds Utilized')).toBe('₹1,50,000')
    expect(fieldValue(result.html, 'Beneficiaries')).toBe('300')
    expect(fieldValue(result.html, 'Progress')).toBe('60%')
    expect(fieldValue(result.html, 'Implementing Partner')).toBe('Acme &lt;Industries&gt;')
    expect(result.html.indexOf('<td>Survey')).toBeLessThan(result.html.indexOf('<td>Drill'))
    expectCleanOutput(result.html)
  })

  it('reports a lead campaign for its lead NGO', async () => {
    const result = await generate(ngo, { documentType: 'impact_report', campaignId: 'c1' })
    expect(fieldValue(result.html, 'Implementing Partner')).toBe('Acme &lt;Industries&gt;')
    expect(fieldValue(result.html, 'Prepared For')).toBe('Lead NGO / Implementing Partner')
  })

  it.each([
    [company, {}, 'Select a campaign for the impact report'],
    [rival, { campaignId: 'c1' }, 'Campaign not found or not owned by this company'],
    [ngo, {}, 'Select a project or lead campaign for the impact report'],
    [ngo, { projectId: 'p2' }, 'Project not assigned to this NGO'],
    [otherNgo, { campaignId: 'c1' }, 'Campaign is not assigned to this NGO as lead'],
    [ngo, { campaignId: 'missing' }, 'Campaign not found'],
  ])('%#: refuses %o', async (user, request, error) => {
    await expect(generate(user, { documentType: 'impact_report', ...request })).rejects.toThrow(error)
  })
})

describe('utilization certificate', () => {
  it('sums confirmed payments across a company campaign', async () => {
    const result = await generate(company, { documentType: 'utilization_certificate', campaignId: 'c1' })
    expect(result.filename).toBe('acme-industries-utilization-clean-water-sanitation.html')
    expect(fieldValue(result.html, 'Amount Received (Confirmed)')).toBe('₹2,60,000')
    expect(fieldValue(result.html, 'Amount Utilized')).toBe('₹2,00,000')
    expect(fieldValue(result.html, 'Unutilized Balance (Received − Utilized)')).toBe('₹60,000')
    expect(fieldValue(result.html, 'Utilization vs Budget')).toBe('40.0%')
    expect(fieldValue(result.html, 'Implementing Agency / NGO')).toBe('Seva Trust')
    expect(result.html.match(/<td>Payment \d<\/td>/g)).toEqual(['<td>Payment 1</td>', '<td>Payment 2</td>', '<td>Payment 1</td>'])
    expectCleanOutput(result.html)
  })

  it('uses project utilization over the campaign figure', async () => {
    db.campaigns = [{ ...campaign, impact_metrics: { funds_utilized: 7500 } }]
    const owner = await generate(company, { documentType: 'utilization_certificate', campaignId: 'c1' })
    expect(fieldValue(owner.html, 'Amount Utilized')).toBe('₹2,00,000')
    const lead = await generate(ngo, { documentType: 'utilization_certificate', campaignId: 'c1' })
    expect(fieldValue(lead.html, 'Amount Utilized')).toBe('₹1,50,000')
  })

  it('falls back to the campaign utilization without project figures', async () => {
    db.projects = []
    db.campaigns = [{ ...campaign, impact_metrics: { funds_utilized: 7500 } }]
    const result = await generate(company, { documentType: 'utilization_certificate', campaignId: 'c1' })
    expect(fieldValue(result.html, 'Amount Utilized')).toBe('₹7,500')
  })

  it('covers a single company project', async () => {
    const result = await generate(company, { documentType: 'utilization_certificate', projectId: 'p1' })
    expect(fieldValue(result.html, 'Amount Received (Confirmed)')).toBe('₹2,00,000')
    expect(fieldValue(result.html, 'Unutilized Balance (Received − Utilized)')).toBe('₹50,000')
    expect(fieldValue(result.html, 'Utilization vs Budget')).toBe('30.0%')
    expect(result.html).not.toContain('Data Completeness Notes')
  })

  it('flags a project without payments or utilization', async () => {
    db.projects = [{ ...projects[0], csr_impact_metrics: [], csr_payment_confirmations: [] }]
    const result = await generate(company, { documentType: 'utilization_certificate', projectId: 'p1' })
    expect(result.html).toContain('No confirmed payments or utilization figures found')
    expectCleanOutput(result.html)
  })

  it('limits a lead NGO campaign certificate to its own projects', async () => {
    const result = await generate(ngo, { documentType: 'utilization_certificate', campaignId: 'c1' })
    expect(fieldValue(result.html, 'Funding Company')).toBe('Acme &lt;Industries&gt;')
    expect(fieldValue(result.html, 'Amount Received (Confirmed)')).toBe('₹2,00,000')
    expect(fieldValue(result.html, 'Amount Utilized')).toBe('₹1,50,000')
  })

  it.each([
    [rival, { projectId: 'p1' }, 'Project not owned by this company'],
    [company, {}, 'Select a campaign or project for the utilization certificate'],
    [otherNgo, { projectId: 'p1' }, 'Project not assigned to this NGO'],
    [ngo, {}, 'Select a project or lead campaign for the utilization certificate'],
  ])('%#: refuses %o', async (user, request, error) => {
    await expect(generate(user, { documentType: 'utilization_certificate', ...request })).rejects.toThrow(error)
  })
})

describe('NGO documents', () => {
  it('summarizes compliance tags', async () => {
    const result = await generate(ngo, { documentType: 'ngo_compliance_pack' })
    expect(result.filename).toBe('seva-trust-compliance-status-pack.html')
    expect(result.html.match(/badge-ok">Recorded/g)).toHaveLength(2)
    expect(result.html).toContain('80G not present as a live CA compliance tag')
    expect(result.html).toContain('FCRA not present as a live CA compliance tag')
    expect(fieldValue(result.html, 'CA Badge (if issued)')).toBe('CA-77')
    expect(fieldValue(result.html, 'Location')).toBe('Pune')
    expectCleanOutput(result.html)
  })

  it('builds the implementing agency report for a project', async () => {
    const result = await generate(ngo, { documentType: 'implementing_agency_report', projectId: 'p1' })
    expect(result.filename).toBe('seva-trust-implementing-agency-wells.html')
    expect(fieldValue(result.html, 'Received')).toBe('₹2,00,000')
    expect(fieldValue(result.html, 'Utilized')).toBe('₹1,50,000')
    expect(result.html).toContain('<li>12A recorded on GRAM</li>')
    expect(result.html).toContain('<li>CSR-1 recorded on GRAM</li>')
    expect(result.html).not.toContain('CSR-1 tag not live')
    expectCleanOutput(result.html)
  })

  it('builds the implementing agency report for a lead campaign', async () => {
    const result = await generate(ngo, { documentType: 'implementing_agency_report', campaignId: 'c1' })
    expect(fieldValue(result.html, 'Lead Campaign')).toBe('Clean Water &amp; Sanitation')
    expect(fieldValue(result.html, 'Received')).toBe('—')
    expect(result.html).toContain('<td>15 October 2026</td>')
    expectCleanOutput(result.html)
  })

  it('flags a missing CSR-1 tag and requires an entity', async () => {
    await expect(generate(otherNgo, { documentType: 'implementing_agency_report' })).rejects.toThrow(
      'Select a project or lead campaign for the implementing agency report'
    )
    db.projects = [{ ...projects[1] }]
    const result = await generate(otherNgo, { documentType: 'implementing_agency_report', projectId: 'p2' })
    expect(result.html).toContain('CSR-1 tag not live')
  })
})
