import { expect } from 'vitest'
import { eqValue, hasCall, type FakeQuery, type FakeResult } from './campaign-supabase-fake'

type Row = Record<string, unknown>

export function fieldValue(html: string, label: string): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = html.match(new RegExp(`${escaped}</(?:div|span)>\\s*<(?:div|span) class="field-value">([^<]*)<`))
  return match?.[1]
}

export function expectCleanOutput(html: string) {
  const text = html.replace(/<style>[\s\S]*?<\/style>/, '')
  expect(text).not.toMatch(/undefined|NaN|\[object Object\]|>null</)
}

export const users: Record<number, Row> = {
  3: {
    id: 3,
    name: 'Acme <Industries>',
    email: 'csr@acme.com',
    user_type: 'company',
    verification_status: 'verified',
    profile_data: {
      cin: 'L12345MH2000PLC123456',
      pan: 'AAACA1234A',
      registered_office: 'Nariman Point, Mumbai',
      net_worth: 450,
      turnover: 1250.5,
      net_profit: 6,
      csr_vision: 'Water for every village',
      focus_areas: ['Sanitation', 'Education & <Skills>'],
      website: 'https://acme.example/csr',
      average_net_profit_inr: 10000000,
    },
  },
  12: {
    id: 12,
    name: 'Seva Trust',
    email: 'hello@seva.org',
    user_type: 'ngo',
    verification_status: 'verified',
    profile_data: { city: 'Pune', ca_compliance_tags: ['twelve_a', 'csr1'], ca_badge_number: 'CA-77' },
  },
  13: { id: 13, name: 'Other NGO', user_type: 'ngo', profile_data: {} },
  40: { id: 40, name: 'Rival Corp', user_type: 'company', profile_data: {} },
}

export const campaign: Row = {
  id: 'c1',
  company_id: 3,
  lead_ngo_user_id: 12,
  title: 'Clean Water & Sanitation',
  category: 'Water',
  location: 'Pune',
  schedule_vii: '(i) Sanitation',
  sdg_alignment: [6],
  budget_inr: 500000,
  status: 'active',
  description: 'Borewells for <b>three</b> villages',
  impact_metrics: {},
  milestones: [{ title: 'Survey', status: 'done', budget_allocated: 200000, due_date: '2026-10-15' }],
}

export const projects: Row[] = [
  {
    id: 'p1',
    company_user_id: 3,
    ngo_user_id: 12,
    campaign_id: 'c1',
    title: 'Wells',
    project_status: 'in_progress',
    campaigns: campaign,
    csr_impact_metrics: [
      { funds_utilized: 100000, beneficiaries: 250, progress_percentage: 40, last_updated: '2026-08-01' },
      { funds_utilized: 150000, beneficiaries: 300, progress_percentage: 60, last_updated: '2026-09-01' },
    ],
    csr_payment_confirmations: [
      { amount: 200000, payment_status: 'confirmed', payment_reference: 'UTR-1' },
      { amount: 50000, payment_status: 'pending', payment_reference: null },
    ],
    csr_project_milestones: [
      { title: 'Drill', status: 'pending', amount: 120000, due_date: '2026-11-01', milestone_order: 2 },
      { title: 'Survey', status: 'done', amount: 30000, due_date: '2026-10-01', milestone_order: 1 },
    ],
  },
  {
    id: 'p2',
    company_user_id: 3,
    ngo_user_id: 13,
    campaign_id: 'c1',
    title: 'Toilets',
    project_status: 'planned',
    campaigns: campaign,
    csr_impact_metrics: [{ funds_utilized: 50000, beneficiaries: 50, progress_percentage: 20, last_updated: '2026-09-01' }],
    csr_payment_confirmations: [{ amount: 60000, payment_status: 'Confirmed', payment_reference: 'UTR-2' }],
    csr_project_milestones: [],
  },
]

export const db = {
  campaigns: [campaign] as Row[],
  projects: projects as Row[],
}

export function resetDb() {
  db.campaigns = [campaign]
  db.projects = projects
}

function matches(row: Row, query: FakeQuery, columns: string[]) {
  return columns.every((column) => {
    const value = eqValue(query, column)
    return value === undefined || String(row[column]) === String(value)
  })
}

export function respond(query: FakeQuery): FakeResult | undefined {
  const single = hasCall(query, 'maybeSingle') || hasCall(query, 'single')
  if (query.table === 'users') {
    return { data: users[Number(eqValue(query, 'id'))] ?? null }
  }
  if (query.table === 'campaigns') {
    const rows = db.campaigns.filter((row) => matches(row, query, ['id', 'company_id']))
    return { data: single ? rows[0] ?? null : rows }
  }
  if (query.table === 'csr_projects') {
    const rows = db.projects.filter((row) => matches(row, query, ['id', 'campaign_id', 'company_user_id']))
    return { data: single ? rows[0] ?? null : rows }
  }
  return undefined
}
