import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as accept } from '@/app/api/campaigns/accept-lead/route'
import { POST as decline } from '@/app/api/campaigns/decline-lead/route'
import { POST as updateStatuses } from '@/app/api/auto-update-statuses/route'
import { GET as listRequests, POST as createRequest } from '@/app/api/service-requests/route'
import { POST as volunteer } from '@/app/api/campaigns/[id]/volunteer/route'
import { DELETE as deleteAccount } from '@/app/api/auth/delete-account/route'
import { POST as changePassword } from '@/app/api/auth/change-password/route'
import { POST as upload, DELETE as deleteUpload } from '@/app/api/upload/route'
import { POST as verificationUpload } from '@/app/api/verification/upload/route'
import { GET as projectEvidence } from '@/app/api/csr-projects/[id]/evidence/route'
import { GET as projectAudit } from '@/app/api/csr-projects/[id]/audit/route'
import { POST as reviewMaterial } from '@/app/api/csr-projects/[id]/materials/[materialId]/review/route'
import { POST as reviewExpense } from '@/app/api/csr-projects/[id]/expenses/[expenseId]/review/route'
import { GET as verificationStatus } from '@/app/api/verification/status/route'
import { GET as users } from '@/app/api/users/route'
import { POST as receipt } from '@/app/api/uploads/receipt/route'
import { POST as updateProfile, PUT as updateProfileForm } from '@/app/api/profile/update/route'
import { POST as individualVerification, GET as individualVerificationStatus } from '@/app/api/verification/individual/route'
import { POST as companyVerification, GET as companyVerificationStatus } from '@/app/api/verification/company/route'
import { POST as ngoVerification, GET as ngoVerificationStatus } from '@/app/api/verification/ngo/route'
import { GET as agentProgress, POST as saveAgentProgress } from '@/app/api/ai-agent/progress/route'
import { DELETE as deleteAgentSession } from '@/app/api/ai-agent/sessions/[id]/route'
import { POST as scoreNgos } from '@/app/api/ngos/score/route'
import { resolveDocumentAccessActor } from '@/lib/kyc/document-access'
import { POST as generateCampaigns } from '@/app/api/csr-agent/generate-campaigns/route'
import { POST as suggestMilestones } from '@/app/api/csr-agent/suggest-milestones/route'
import { POST as getRecommendations } from '@/app/api/csr-agent/get-recommendations/route'
import { GET as getLeadInvites, POST as manageLeadInvites } from '@/app/api/csr-agent/lead-ngo-invites/route'
import { POST as recommendRequests } from '@/app/api/service-requests/recommend/route'
import { GET as campaigns } from '@/app/api/campaigns/route'
import { GET as campaign } from '@/app/api/campaigns/[id]/route'
import { GET as profile } from '@/app/api/profile/[userId]/route'
import { GET as ngoList } from '@/app/api/ngos/list/route'
import { GET as serviceRequest, PUT as updateServiceRequest, DELETE as deleteServiceRequest } from '@/app/api/service-requests/[id]/route'
import { GET as supportTickets } from '@/app/api/help-support/tickets/route'
import { PUT as updateProject, DELETE as deleteProject } from '@/app/api/service-request-projects/[id]/route'
import { POST as createPaymentOrder } from '@/app/api/service-requests/[id]/payments/create-order/route'
import { POST as verifyPayment } from '@/app/api/service-requests/[id]/payments/verify/route'
import { POST as settleAssignment } from '@/app/api/service-assignments/[id]/settle/route'
import { POST as verifyOfferPayment } from '@/app/api/service-offers/[id]/clients/[clientId]/payments/verify/route'
import { setLiveUserTypeOverlay } from '@/lib/auth/session'
import { overlayLiveUserType } from '@/lib/server-auth'
import { createSupabaseFake } from './support/supabase-fake'

const mocks = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({ supabase: { from: mocks.from }, db: {} }))
vi.mock('@/lib/service-requests/list-query', () => ({ listServiceRequests: vi.fn().mockResolvedValue([]) }))

type Handler = (request: NextRequest) => Promise<Response>
const cases: Array<[string, Handler, string, string]> = [
  ['accept lead', accept, 'POST', '/api/campaigns/accept-lead'],
  ['decline lead', decline, 'POST', '/api/campaigns/decline-lead'],
  ['update statuses', updateStatuses, 'POST', '/api/auto-update-statuses'],
  ['personal requests', listRequests, 'GET', '/api/service-requests?view=my-requests'],
  ['create request', createRequest, 'POST', '/api/service-requests'],
  ['campaign volunteer', (req) => volunteer(req, { params: Promise.resolve({ id: 'campaign' }) }), 'POST', '/api/campaigns/campaign/volunteer'],
  ['delete account', deleteAccount, 'DELETE', '/api/auth/delete-account'],
  ['change password', changePassword, 'POST', '/api/auth/change-password'],
  ['upload', upload, 'POST', '/api/upload'],
  ['delete upload', deleteUpload, 'DELETE', '/api/upload'],
  ['verification upload', verificationUpload, 'POST', '/api/verification/upload'],
  ['project evidence', (req) => projectEvidence(req, { params: Promise.resolve({ id: 'project' }) }), 'GET', '/api/csr-projects/project/evidence'],
  ['project audit', (req) => projectAudit(req, { params: Promise.resolve({ id: 'project' }) }), 'GET', '/api/csr-projects/project/audit'],
  ['material review', (req) => reviewMaterial(req, { params: Promise.resolve({ id: 'project', materialId: 'material' }) }), 'POST', '/api/csr-projects/project/materials/material/review'],
  ['expense review', (req) => reviewExpense(req, { params: Promise.resolve({ id: 'project', expenseId: 'expense' }) }), 'POST', '/api/csr-projects/project/expenses/expense/review'],
  ['verification status', verificationStatus, 'GET', '/api/verification/status'],
  ['users', users, 'GET', '/api/users'],
  ['receipt upload', receipt, 'POST', '/api/uploads/receipt'],
  ['profile update', updateProfile, 'POST', '/api/profile/update'],
  ['profile form update', updateProfileForm, 'PUT', '/api/profile/update'],
  ['individual verification', individualVerification, 'POST', '/api/verification/individual'],
  ['individual verification status', individualVerificationStatus, 'GET', '/api/verification/individual'],
  ['company verification', companyVerification, 'POST', '/api/verification/company'],
  ['company verification status', companyVerificationStatus, 'GET', '/api/verification/company'],
  ['ngo verification', ngoVerification, 'POST', '/api/verification/ngo'],
  ['ngo verification status', ngoVerificationStatus, 'GET', '/api/verification/ngo'],
  ['agent progress', agentProgress, 'GET', '/api/ai-agent/progress'],
  ['save agent progress', saveAgentProgress, 'POST', '/api/ai-agent/progress'],
  ['delete agent session', (req) => deleteAgentSession(req, { params: Promise.resolve({ id: 'session' }) }), 'DELETE', '/api/ai-agent/sessions/session'],
  ['score NGOs', scoreNgos, 'POST', '/api/ngos/score'],
  ['generate campaigns', generateCampaigns, 'POST', '/api/csr-agent/generate-campaigns'],
  ['suggest milestones', suggestMilestones, 'POST', '/api/csr-agent/suggest-milestones'],
  ['campaign recommendations', getRecommendations, 'POST', '/api/csr-agent/get-recommendations'],
  ['lead invites', getLeadInvites, 'GET', '/api/csr-agent/lead-ngo-invites'],
  ['manage lead invites', manageLeadInvites, 'POST', '/api/csr-agent/lead-ngo-invites'],
  ['request recommendations', recommendRequests, 'POST', '/api/service-requests/recommend'],
  ['update service request', (req) => updateServiceRequest(req, { params: Promise.resolve({ id: '1' }) }), 'PUT', '/api/service-requests/1'],
  ['delete service request', (req) => deleteServiceRequest(req, { params: Promise.resolve({ id: '1' }) }), 'DELETE', '/api/service-requests/1'],
  ['support tickets', supportTickets, 'GET', '/api/help-support/tickets'],
  ['update project', (req) => updateProject(req, { params: Promise.resolve({ id: '1' }) }), 'PUT', '/api/service-request-projects/1'],
  ['delete project', (req) => deleteProject(req, { params: Promise.resolve({ id: '1' }) }), 'DELETE', '/api/service-request-projects/1'],
  ['create payment order', (req) => createPaymentOrder(req, { params: Promise.resolve({ id: '1' }) }), 'POST', '/api/service-requests/1/payments/create-order'],
  ['verify payment', (req) => verifyPayment(req, { params: Promise.resolve({ id: '1' }) }), 'POST', '/api/service-requests/1/payments/verify'],
  ['settle assignment', (req) => settleAssignment(req, { params: Promise.resolve({ id: '1' }) }), 'POST', '/api/service-assignments/1/settle'],
  ['verify offer payment', (req) => verifyOfferPayment(req, { params: Promise.resolve({ id: '1', clientId: '2' }) }), 'POST', '/api/service-offers/1/clients/2/payments/verify'],
]
const personalized: Array<[string, Handler, string]> = [
  ['campaigns', campaigns, '/api/campaigns'],
  ['campaign', (req) => campaign(req, { params: Promise.resolve({ id: '1' }) }), '/api/campaigns/1'],
  ['profile', (req) => profile(req, { params: Promise.resolve({ userId: '12' }) }), '/api/profile/12'],
  ['NGO list', ngoList, '/api/ngos/list'],
  ['service request', (req) => serviceRequest(req, { params: Promise.resolve({ id: '1' }) }), '/api/service-requests/1'],
]

function request(path: string, method: string, token?: string) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: token ? { cookie: `token=${token}`, 'content-type': 'application/json' } : {},
    ...(method === 'POST' ? { body: '{}' } : {}),
  })
}

const token = jwt.sign({ id: 12, email: 'person@example.test', user_type: 'ngo' }, 'test-secret')

function database(state: 'outage' | 'employee' | 'ordinary') {
  return createSupabaseFake((query) => {
    if (query.table === 'users') return state === 'outage'
      ? { error: new Error('test failure') }
      : { data: { id: 12, user_type: 'ngo', account_status: 'active', verification_status: 'verified' } }
    if (query.table === 'company_employee_identities') return {
      data: state === 'employee' ? { id: 'employee', user_id: 12, company_user_id: 20, status: 'active' } : null,
    }
    if (query.table === 'service_requests') return { data: [] }
    return { data: null }
  })
}

beforeEach(() => {
  vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'test')
  vi.stubEnv('CLOUDINARY_API_KEY', 'test')
  vi.stubEnv('CLOUDINARY_API_SECRET', 'test')
  mocks.from.mockReset()
  setLiveUserTypeOverlay((claims, pathname) => overlayLiveUserType(claims, pathname))
})

describe('protected route session enforcement', () => {
  it.each(cases)('%s denies lookup outages without clearing cookies', async (_label, handler, method, path) => {
    const fake = database('outage')
    mocks.from.mockImplementation(fake.from)
    const response = await handler(request(path, method, token))
    expect(response.status).toBe(503)
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(fake.find('campaigns')).toHaveLength(0)
    expect(fake.find('service_requests')).toHaveLength(0)
    expect(fake.find('csr_projects')).toHaveLength(0)
  })

  it.each(cases)('%s denies a delegated employee even with an NGO token', async (_label, handler, method, path) => {
    const fake = database('employee')
    mocks.from.mockImplementation(fake.from)
    expect((await handler(request(path, method, token))).status).toBe(403)
    expect(fake.find('campaigns')).toHaveLength(0)
    expect(fake.find('service_requests')).toHaveLength(0)
  })

  it.each(cases)('%s denies missing authentication', async (_label, handler, method, path) => {
    expect((await handler(request(path, method))).status).toBe(401)
  })

  it('keeps the public service request listing anonymous', async () => {
    const response = await listRequests(request('/api/service-requests', 'GET'))
    expect(response.status).toBe(200)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('does not authorize a document owner during a session lookup outage', async () => {
    const fake = database('outage')
    mocks.from.mockImplementation(fake.from)
    await expect(resolveDocumentAccessActor(request('/api/verification/documents/id/file', 'GET', token)))
      .rejects.toMatchObject({ status: 503 })
  })

  it.each(personalized)('%s fails closed for personalized access during lookup outages', async (_label, handler, path) => {
    const fake = database('outage')
    mocks.from.mockImplementation(fake.from)
    const response = await handler(request(path, 'GET', token))
    expect(response.status).toBe(503)
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('allows an active ordinary user to reach the protected operation', async () => {
    const fake = database('ordinary')
    mocks.from.mockImplementation(fake.from)
    const response = await updateStatuses(request('/api/auto-update-statuses', 'POST', token))
    expect(response.status).toBe(200)
    expect(fake.find('service_requests')).toHaveLength(1)
  })
})
