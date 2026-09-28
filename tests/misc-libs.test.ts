import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AGENT_CTA,
  agentLoadingLabel,
  buildProjectContextWithPublished,
  captureMobileChatScrollPosition,
  isMobileAgentViewport,
  readPublishedEntity,
} from '@/lib/ai-agent-sessions'
import {
  normalizeCompanyFocusAreasScheduleVii,
  normalizeCompanyGovernanceMechanism,
  normalizeCompanyImplementationModel,
} from '@/lib/categories'
import { createDelhiveryShipment, getDelhiveryTrackingSnapshot, sanitizeDelhiveryText, type CreateDelhiveryShipmentInput } from '@/lib/delhivery'
import {
  confirmedFunds,
  milestonesFromCampaign,
  milestonesFromProject,
  paymentLineItems,
  pickLatestImpact,
} from '@/lib/document-generation/assemble/project-data'
import {
  asNumber,
  companyFocusAreas,
  companyWebsite,
  currentFinancialYearLabel,
  periodLabel,
  slugify,
} from '@/lib/document-generation/assemble/values'
import { buildDocumentReference, escapeHtml, formatInr, renderGapsSection } from '@/lib/document-generation/shared-layout'
import { emailService, escapeHtml as escapeEmailHtml, sendEmail } from '@/lib/email'
import {
  formatDetailDate,
  formatDisplayDate,
  formatStatusLabel,
  getCampaignLeadLifecycle,
  isVolunteerRegistrationPastDeadline,
  parseCampaignLocalDate,
} from '@/lib/format-date'
import { GRAM_AVATAR_INITIALS, GRAM_AVATAR_PALETTE, getGramAvatarFallbackStyle, getGramAvatarSolid } from '@/lib/gram-avatar'
import { generateOTPMessage, sendSMS } from '@/lib/sms'

const mocks = vi.hoisted(() => {
  process.env.SMTP_HOST = 'smtp.test'
  process.env.SMTP_USER = 'mailer@test'
  process.env.SMTP_PASS = 'pass'
  const sendMail = vi.fn()
  return { sendMail, createTransport: vi.fn(() => ({ sendMail })) }
})

vi.mock('@/lib/db', () => ({ supabase: {}, db: {}, createServerClient: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))
vi.mock('nodemailer', () => ({ default: { createTransport: mocks.createTransport } }))

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

afterAll(() => {
  delete process.env.SMTP_HOST
  delete process.env.SMTP_USER
  delete process.env.SMTP_PASS
})

describe('categories', () => {
  const EDUCATION = 'Education and Livelihood Enhancement'

  it('keeps only Schedule VII focus areas', () => {
    expect(normalizeCompanyFocusAreasScheduleVii([EDUCATION, 'Space', 3])).toEqual([EDUCATION])
    expect(normalizeCompanyFocusAreasScheduleVii(`We fund ${EDUCATION.toLowerCase()} and sports promotion`)).toEqual([EDUCATION, 'Sports Promotion'])
    expect(normalizeCompanyFocusAreasScheduleVii(null)).toEqual([])
  })

  it.each([
    ['partner_led', 'partner_led'],
    ['Hybrid (direct + NGO partners)', 'hybrid'],
    ['Through NGO funding', 'partner_led'],
    ['Grant based', 'grant_making'],
    ['Direct execution', 'direct'],
    ['Unknown', ''],
  ])('normalises implementation model %j', (value, expected) => {
    expect(normalizeCompanyImplementationModel(value)).toBe(expected)
  })

  it.each([
    ['csr_committee_board', 'csr_committee_board'],
    ['Hybrid review', 'hybrid_governance'],
    ['External audit', 'third_party_monitoring'],
    ['Management CSR cell', 'management_csr_cell'],
    ['Board committee', 'csr_committee_board'],
    ['', ''],
  ])('normalises governance mechanism %j', (value, expected) => {
    expect(normalizeCompanyGovernanceMechanism(value)).toBe(expected)
  })
})

describe('format-date', () => {
  it.each([
    ['2026-03-05', '05/03/2026'],
    ['2026-03-05T22:00:00Z', '05/03/2026'],
    ['5/3/2026', '05/03/2026'],
    ['not a date', 'not a date'],
    ['', ''],
    [null, ''],
  ])('formats %j as %j', (value, expected) => {
    expect(formatDisplayDate(value)).toBe(expected)
  })

  it('formats detail dates and status labels', () => {
    expect(formatDetailDate(null)).toBe('Not set')
    expect(formatDetailDate('2026-01-02')).toBe('02/01/2026')
    expect(formatStatusLabel('pending_acceptance')).toBe('Pending Acceptance')
    expect(formatStatusLabel('  ')).toBe('Unknown')
  })

  it('parses campaign dates as local days', () => {
    expect(parseCampaignLocalDate('2026-03-05')).toEqual(new Date(2026, 2, 5))
    expect(parseCampaignLocalDate('garbage')).toBeNull()
  })

  it.each([
    [{ campaignStatus: 'cancelled', startDate: '2026-07-01' }, 'completed'],
    [{ startDate: '2026-05-01', endDate: '2026-05-31' }, 'completed'],
    [{ startDate: '2026-06-10', endDate: '2026-06-10' }, 'started'],
    [{ startDate: '2026-06-11' }, 'yet_to_start'],
    [{}, 'yet_to_start'],
  ])('derives lifecycle for %j', (input, expected) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 5, 10, 12))
    expect(getCampaignLeadLifecycle(input)).toBe(expected)
  })

  it('closes volunteer registration at the end of the day before the start', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 5, 9, 23, 59))
    expect(isVolunteerRegistrationPastDeadline('2026-06-10')).toBe(false)
    vi.setSystemTime(new Date(2026, 5, 10, 0, 1))
    expect(isVolunteerRegistrationPastDeadline('2026-06-10')).toBe(true)
    expect(isVolunteerRegistrationPastDeadline(null)).toBe(false)
  })
})

describe('gram avatar', () => {
  it('picks a stable palette colour regardless of case and spacing', () => {
    const colour = getGramAvatarSolid('Asha Foundation')
    expect(GRAM_AVATAR_PALETTE).toContain(colour)
    expect(getGramAvatarSolid('  asha foundation ')).toBe(colour)
    expect(getGramAvatarSolid('')).toBe(getGramAvatarSolid('g'))
    expect(getGramAvatarFallbackStyle('Asha Foundation')).toEqual({ backgroundColor: colour, color: GRAM_AVATAR_INITIALS })
  })

  it('spreads names across the palette', () => {
    const colours = new Set(['Asha', 'Bodhi', 'Chetna', 'Disha', 'Ekta', 'Farm', 'Gyan', 'Hope'].map(getGramAvatarSolid))
    expect(colours.size).toBeGreaterThan(1)
  })
})

describe('document generation helpers', () => {
  it('escapes HTML and renders gaps safely', () => {
    expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;')
    expect(escapeHtml(null)).toBe('')
    expect(renderGapsSection([])).toBe('')
    expect(renderGapsSection(['<b>PAN</b>'])).toContain('<li>&lt;b&gt;PAN&lt;/b&gt;</li>')
  })

  it('formats rupee amounts', () => {
    expect(formatInr(1234567.891)).toBe('₹12,34,567.89')
    expect(formatInr(null)).toBe('₹0')
    expect(formatInr(Number.NaN)).toBe('—')
  })

  it('builds dated document references from the organisation name', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-27T06:00:00Z'))
    expect(buildDocumentReference('UC', 'Asha Foundation!')).toBe('UC/ASHAFOUNDATI/20260927')
    expect(buildDocumentReference('UC', '!!!')).toBe('UC/ORG/20260927')
  })

  it.each([
    [new Date(2026, 2, 31), 'FY 2025-26'],
    [new Date(2026, 3, 1), 'FY 2026-27'],
  ])('labels the Indian financial year on %s', (now, label) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(now)
    expect(currentFinancialYearLabel()).toBe(label)
  })

  it('normalises values used in documents', () => {
    expect(slugify('  CSR Report: Q1/2026!! ')).toBe('csr-report-q1-2026')
    expect(slugify('!!!')).toBe('document')
    expect(periodLabel('custom', '2026-01-01', null)).toBe('Custom (2026-01-01 → …)')
    expect(periodLabel('custom')).toBe('Custom Period')
    expect(periodLabel('annual')).toBe('Annual')
    expect(asNumber('abc')).toBe(0)
    expect(companyFocusAreas({ focus_areas: ' Education ' })).toEqual(['Education'])
    expect(companyFocusAreas({ focus_areas_schedule_vii: ['A', ''] })).toEqual(['A'])
    expect(companyWebsite({ csr_policy_url: 'https://x' })).toBe('https://x')
    expect(companyWebsite({})).toBeNull()
  })

  it('reads project impact, milestones and confirmed payments', () => {
    const project = {
      csr_impact_metrics: [
        { id: 'a', last_updated: '2026-01-01' },
        { id: 'b', last_updated: '2026-03-01' },
        { id: 'c', last_updated: null },
      ],
      csr_project_milestones: [
        { title: 'Second', milestone_order: 2, amount: 500, status: 'pending', due_date: null },
        { title: '', milestone_order: 1, amount: '250', status: '', due_date: '2026-02-01' },
      ],
      csr_payment_confirmations: [
        { amount: 1000, payment_status: 'Confirmed', payment_reference: 'UTR1' },
        { amount: 400, payment_status: 'pending', payment_reference: '' },
      ],
    }
    expect(pickLatestImpact(project as never)?.id).toBe('b')
    expect(pickLatestImpact({ csr_impact_metrics: null })).toBeNull()
    expect(milestonesFromProject(project as never).map((m) => [m.title, m.budgetAllocated, m.status])).toEqual([
      ['Untitled milestone', 250, null],
      ['Second', 500, 'pending'],
    ])
    expect(confirmedFunds(project as never)).toBe(1000)
    expect(paymentLineItems(project as never)).toEqual([
      { label: 'Payment 1', amount: 1000, status: 'Confirmed', note: 'UTR1' },
      { label: 'Payment 2', amount: 400, status: 'pending', note: null },
    ])
  })

  it('reads campaign milestones with budget and date fallbacks', () => {
    expect(milestonesFromCampaign({ milestones: [{ title: 'Kickoff', budget: 300, end_date: '2026-05-01' }, null] })).toEqual([
      { title: 'Kickoff', status: null, budgetAllocated: 300, dueDate: '2026-05-01', description: null },
      { title: 'Untitled milestone', status: null, budgetAllocated: 0, dueDate: null, description: null },
    ])
    expect(milestonesFromCampaign({ milestones: 'x' })).toEqual([])
  })
})

describe('ai agent sessions', () => {
  it('reads the published campaign before the project', () => {
    expect(readPublishedEntity({ publishedCampaignId: ' c1 ', published_project_id: 'p1' })).toEqual({ type: 'campaign', id: 'c1' })
    expect(readPublishedEntity({ published_project_id: 'p1' })).toEqual({ type: 'project', id: 'p1' })
    expect(readPublishedEntity({ published_campaign_id: '  ' })).toBeNull()
    expect(readPublishedEntity('x')).toBeNull()
  })

  it('merges session context and stamps the first publish time', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-27T00:00:00Z'))
    expect(buildProjectContextWithPublished(
      { project_context: { a: 1 }, projectData: { b: 2 }, publishedProjectId: 42 },
      { a: 0, c: 3 }
    )).toEqual({ a: 1, b: 2, c: 3, published_project_id: '42', ai_agent_published_at: '2026-09-27T00:00:00.000Z' })
    expect(buildProjectContextWithPublished({ published_campaign_id: 'c1' }, { ai_agent_published_at: '2026-01-01' }).ai_agent_published_at).toBe('2026-01-01')
    expect(buildProjectContextWithPublished({}, { a: 1 })).toEqual({ a: 1 })
  })

  it('treats the server as a non-mobile viewport', () => {
    expect(isMobileAgentViewport()).toBe(false)
    expect(captureMobileChatScrollPosition()).toBeNull()
    expect(agentLoadingLabel('Atlas')).toBe('Loading Atlas...')
    expect(AGENT_CTA.ngo.href).toBe('/ngos/ai-agent')
  })
})

describe('delhivery', () => {
  const shipment: CreateDelhiveryShipmentInput = {
    orderId: 'ORD#1;',
    pickupLocationName: 'Warehouse',
    consignee: { name: 'Asha & Co', phone: '+91 98765 43210', address: '12, MG Road #4', city: 'Pune', state: 'MH', pincode: '411 001' },
    seller: { name: 'Acme', phone: '022-12345678', address: 'Plot 5', city: 'Mumbai', state: 'MH', pincode: '400001' },
    weightGrams: 50,
    quantity: 0,
  }

  function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  }

  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.stubEnv('DELHIVERY_API_TOKEN', 'tok')
    vi.stubEnv('DELHIVERY_API_BASE_URL', 'https://delhivery.test/')
    vi.stubEnv('DELHIVERY_PICKUP_LOCATION_NAME', '')
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('strips characters Delhivery rejects', () => {
    expect(sanitizeDelhiveryText(' A & B;  #5 \\ 10% ')).toBe('A B 5 10')
    expect(sanitizeDelhiveryText('x'.repeat(300))).toHaveLength(240)
  })

  it('books a shipment with normalised contact details', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, packages: [{ waybill: 'WB1', status: 'Success' }] }))

    await expect(createDelhiveryShipment(shipment)).resolves.toMatchObject({
      success: true,
      waybill: 'WB1',
      orderId: 'ORD#1;',
      status: 'Success',
      remark: null,
    })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://delhivery.test/api/cmu/create.json')
    expect(init.headers.Authorization).toBe('Token tok')
    const payload = JSON.parse(String(init.body).replace('format=json&data=', ''))
    expect(payload.pickup_location).toEqual({ name: 'Warehouse' })
    expect(payload.shipments[0]).toMatchObject({
      order: 'ORD 1',
      name: 'Asha Co',
      add: '12, MG Road 4',
      pin: '411001',
      phone: '9876543210',
      return_phone: '2212345678',
      weight: '100',
      quantity: 1,
      payment_mode: 'Prepaid',
      country: 'India',
    })
  })

  it.each<[string, Partial<CreateDelhiveryShipmentInput>, RegExp]>([
    ['short consignee phone', { consignee: { ...shipment.consignee, phone: '12345' } }, /Consignee phone number is required/],
    ['short seller phone', { seller: { ...shipment.seller, phone: '99' } }, /Pickup contact phone number is required/],
    ['bad consignee pincode', { consignee: { ...shipment.consignee, pincode: '4110' } }, /Consignee pincode must be 6 digits/],
    ['bad seller pincode', { seller: { ...shipment.seller, pincode: '' } }, /Pickup pincode must be 6 digits/],
    ['no pickup location', { pickupLocationName: '' }, /DELHIVERY_PICKUP_LOCATION_NAME is not configured/],
  ])('rejects a booking with %s', async (_label, overrides, message) => {
    await expect(createDelhiveryShipment({ ...shipment, ...overrides })).rejects.toThrow(message)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('requires an API token', async () => {
    vi.stubEnv('DELHIVERY_API_TOKEN', '')
    await expect(createDelhiveryShipment(shipment)).rejects.toThrow('Delhivery API token is not configured')
  })

  it('surfaces booking errors and missing waybills', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ rmk: 'Pincode not serviceable' }, 400))
    await expect(createDelhiveryShipment(shipment)).rejects.toThrow('Pincode not serviceable')
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, packages: [] }))
    await expect(createDelhiveryShipment(shipment)).rejects.toThrow('Delhivery did not return a waybill')
  })

  it('builds a tracking snapshot with newest events first', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      ShipmentData: [{
        Shipment: {
          AWB: 'WB1',
          Status: { Status: 'In Transit' },
          Scans: [
            { ScanType: 'Picked Up', ScanDateTime: '2026-01-01T10:00:00Z', ScanLocation: 'Pune' },
            { ScanType: 'In Transit', ScanDateTime: '2026-01-02T10:00:00Z', ScanLocation: 'Mumbai', Instructions: 'Bagged' },
            {},
          ],
        },
      }],
    }))

    const snapshot = await getDelhiveryTrackingSnapshot(' wb1 ')

    expect(fetchMock.mock.calls[0][0]).toBe('https://delhivery.test/api/v1/packages/json/?waybill=wb1')
    expect(snapshot).toMatchObject({
      provider: 'delhivery',
      trackingId: 'WB1',
      currentStatus: 'In Transit',
      lastEventAt: '2026-01-02T10:00:00.000Z',
      lastLocation: 'Mumbai',
    })
    expect(snapshot.events.map((event) => event.status)).toEqual(['In Transit', 'Picked Up'])
    expect(snapshot.events[0].details).toBe('Bagged')
  })

  it('tries the verbose endpoint when the first one fails', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('down', { status: 503 }))
      .mockResolvedValueOnce(new Response('{"status":"Delivered"}', { status: 200 }))
    await expect(getDelhiveryTrackingSnapshot('WB2')).resolves.toMatchObject({ trackingId: 'WB2', currentStatus: 'Delivered', events: [] })
    expect(fetchMock.mock.calls[1][0]).toContain('verbose=2')

    fetchMock.mockImplementation(async () => new Response('gateway error', { status: 502 }))
    await expect(getDelhiveryTrackingSnapshot('WB3')).rejects.toThrow('gateway error')
  })

  it('requires a tracking id', async () => {
    await expect(getDelhiveryTrackingSnapshot('  ')).rejects.toThrow('Tracking ID is required')
  })

  it('reads scan history in the nested ScanDetail shape Delhivery returns', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      ShipmentData: [{
        Shipment: {
          AWB: 'WB1',
          Scans: [
            { ScanDetail: { Scan: 'Manifested', ScanType: 'UD', ScanDateTime: '2026-01-01T10:00:00Z', ScannedLocation: 'Pune' } },
            { ScanDetail: { Scan: 'In Transit', ScanType: 'UD', StatusDateTime: '2026-01-02T10:00:00Z', ScannedLocation: 'Mumbai_Hub', Instructions: 'Shipment picked up' } },
          ],
        },
      }],
    }))
    const snapshot = await getDelhiveryTrackingSnapshot('WB1')
    expect(snapshot.events).toEqual([
      { status: 'In Transit', timestamp: '2026-01-02T10:00:00.000Z', location: 'Mumbai_Hub', details: 'Shipment picked up' },
      { status: 'Manifested', timestamp: '2026-01-01T10:00:00.000Z', location: 'Pune', details: null },
    ])
    expect(snapshot).toMatchObject({ currentStatus: 'In Transit', lastLocation: 'Mumbai_Hub' })
  })
})

describe('email templates', () => {
  beforeEach(() => {
    mocks.sendMail.mockReset().mockResolvedValue({})
  })

  it('includes the rejection reason when given', async () => {
    await expect(emailService.sendServiceOfferRejectionEmail('ngo@example.org', 'Desks', 'Missing photos')).resolves.toEqual({ success: true })
    expect(mocks.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: 'mailer@test',
      to: 'ngo@example.org',
      subject: 'Service Offer Update: Desks',
      text: 'Your service offer "Desks" has been rejected. Reason: Missing photos',
    }))
    expect(mocks.sendMail.mock.calls[0][0].html).toContain('<p>Reason: Missing photos</p>')
  })

  it('omits the reason when none is given', async () => {
    await emailService.sendServiceOfferRejectionEmail('ngo@example.org', 'Desks')
    expect(mocks.sendMail.mock.calls[0][0].text).toBe('Your service offer "Desks" has been rejected.')
    expect(mocks.sendMail.mock.calls[0][0].html).not.toContain('Reason')
  })

  it('announces approvals', async () => {
    await emailService.sendServiceOfferApprovalEmail('ngo@example.org', 'Desks')
    expect(mocks.sendMail.mock.calls[0][0].subject).toBe('Good News: Desks is Now Live!')
  })

  it('reports transport failures instead of throwing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.sendMail.mockRejectedValue(new Error('smtp down'))
    await expect(emailService.sendServiceOfferApprovalEmail('ngo@example.org', 'Desks')).resolves.toMatchObject({ success: false })
  })

  it('uses the configured reply-to and skips sending when SMTP is not configured', async () => {
    vi.stubEnv('SMTP_REPLY_TO', 'help@test')
    await expect(sendEmail({ to: 'a@test', subject: 'Hi', html: '<p>Hi</p>' })).resolves.toEqual({ success: true })
    expect(mocks.sendMail).toHaveBeenCalledWith(expect.objectContaining({ replyTo: 'help@test', text: '' }))

    vi.stubEnv('SMTP_HOST', '')
    await expect(sendEmail({ to: 'a@test', subject: 'Hi', html: '' })).resolves.toEqual({ success: false, message: 'Email service not configured' })
  })

  it('escapes user-supplied text in email HTML but not in the text body or subject', async () => {
    await emailService.sendServiceOfferRejectionEmail('ngo@example.org', '<script>x</script>', '<img src=x>')
    const mail = mocks.sendMail.mock.calls[0][0]
    expect(mail.html).not.toContain('<script>')
    expect(mail.html).not.toContain('<img')
    expect(mail.html).toContain('&lt;script&gt;x&lt;/script&gt;')
    expect(mail.html).toContain('<p>Reason: &lt;img src=x&gt;</p>')
    expect(mail.subject).toBe('Service Offer Update: <script>x</script>')
    expect(mail.text).toContain('Reason: <img src=x>')

    await emailService.sendServiceOfferApprovalEmail('ngo@example.org', 'Desks & "Chairs"')
    expect(mocks.sendMail.mock.calls[1][0].html).toContain('Desks &amp; &quot;Chairs&quot;')
  })

  it('escapes html special characters', () => {
    expect(escapeEmailHtml(`<a href="x">Tom & Jerry's</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;')
    expect(escapeEmailHtml(null)).toBe('')
    expect(escapeEmailHtml(42)).toBe('42')
  })
})

describe('sms', () => {
  it('formats the OTP message', () => {
    expect(generateOTPMessage('123456')).toBe('Your GRAM verification code is 123456. Valid for 10 minutes. Do not share this code with anyone.')
    expect(generateOTPMessage('9', 'Navadrishti')).toContain('Your Navadrishti verification code is 9.')
  })

  it('does not send without MSG91 credentials', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('MSG91_API_KEY', '')
    await expect(sendSMS({ phone: '9876543210', otp: '1' })).resolves.toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends a cleaned number and the default template', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"type":"success"}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('MSG91_API_KEY', 'key')
    vi.stubEnv('MSG91_TEMPLATE_ID', 'tpl')

    await expect(sendSMS({ phone: '+91 98765-43210', otp: '4321' })).resolves.toBe(true)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).toMatchObject({
      template_id: 'tpl',
      mobile: '919876543210',
      otp: '4321',
      message: 'Your GRAM verification code is 4321. Valid for 10 minutes. Do not share this code.',
    })
  })

  it('returns false when MSG91 rejects the request', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"type":"error"}', { status: 401 })))
    vi.stubEnv('MSG91_API_KEY', 'key')
    vi.stubEnv('MSG91_TEMPLATE_ID', 'tpl')
    await expect(sendSMS({ phone: '9876543210', otp: '1' })).resolves.toBe(false)
  })
})
