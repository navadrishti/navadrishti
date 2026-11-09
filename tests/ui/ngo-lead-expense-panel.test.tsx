import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CampaignAssignmentDetails } from '@/app/ngos/dashboard/campaign-assignment-details'
import { setClientSessionToken } from '@/lib/client-session'
import type { CampaignLeadAssignment, NgoCsrProject } from '@/app/ngos/dashboard/types'

const assignment: CampaignLeadAssignment = {
  id: 'campaign-1', campaign_id: 'campaign-1', campaign_title: 'Campaign',
  campaign_status: 'active', lifecycle: 'started', company_id: 3, company_name: 'Company',
}
const project: NgoCsrProject = {
  id: 'project-1', title: 'Project', region: 'Region', project_status: 'active',
  campaign_id: 'campaign-1', financial_access: true,
}

afterEach(() => {
  setClientSessionToken(null)
  vi.unstubAllGlobals()
})

describe('lead NGO campaign expenses', () => {
  it('lets the authorized lead submit and view its submitted expense', async () => {
    setClientSessionToken('test-token')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, url: '/api/csr-projects/project-1/attachments/image-1' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: [
        { id: 'e1', expense_date: '2026-01-01', description: 'Timber', amount: 2500, approval_status: 'proposed' },
      ] }) })
    vi.stubGlobal('fetch', fetchMock)
    render(<CampaignAssignmentDetails assignment={assignment} roleLabel="Lead NGO" project={project} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Amount (INR)'), '2500')
    await user.type(screen.getByLabelText('Description'), 'Timber')
    const receipt = new File(['image'], 'receipt.png', { type: 'image/png' })
    await user.upload(screen.getByLabelText('Receipt or invoice image'), receipt)
    await user.click(screen.getByRole('button', { name: 'Submit expense' }))
    expect(await screen.findByText(/Expense submitted/)).toBeInTheDocument()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/csr-projects/project-1/attachments')
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer test-token')
    expect(fetchMock.mock.calls[0][1].body.get('file')).toBe(receipt)
    expect(fetchMock.mock.calls[1][0]).toBe('/api/csr-projects/project-1/expenses')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ amount: 2500, description: 'Timber', receipt_url: '/api/csr-projects/project-1/attachments/image-1' })
    await user.click(screen.getByRole('button', { name: 'View my submitted expenses' }))
    expect(await screen.findByText(/Timber · INR 2,500 · proposed/)).toBeInTheDocument()
    expect(fetchMock.mock.calls[2][0]).toContain('?mine=1')
  })

  it('does not expose forms for a non-authorized project', () => {
    render(<CampaignAssignmentDetails assignment={assignment} roleLabel="Lead NGO" project={{ ...project, financial_access: false }} />)
    expect(screen.queryByRole('button', { name: 'Submit expense' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Material' })).not.toBeInTheDocument()
  })

  it('submits a material record with authentication', async () => {
    setClientSessionToken('test-token')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, url: '/api/csr-projects/project-1/attachments/image-2' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) })
    vi.stubGlobal('fetch', fetchMock)
    render(<CampaignAssignmentDetails assignment={assignment} roleLabel="Lead NGO" project={project} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Material' }))
    await user.type(screen.getByLabelText('Name'), 'Timber')
    await user.type(screen.getByLabelText('Required quantity'), '5')
    expect(screen.getByLabelText('Unit cost (info only)')).not.toBeVisible()
    await user.upload(screen.getByLabelText('Material or invoice image (optional)'), new File(['image'], 'timber.jpg', { type: 'image/jpeg' }))
    await user.click(screen.getByRole('button', { name: 'Submit material record' }))
    expect(await screen.findByText(/Material record submitted/)).toBeInTheDocument()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/csr-projects/project-1/attachments')
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer test-token')
    expect(fetchMock.mock.calls[1][0]).toBe('/api/csr-projects/project-1/materials')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ name: 'Timber', required_quantity: '5', invoice_url: '/api/csr-projects/project-1/attachments/image-2', evidence_urls: ['/api/csr-projects/project-1/attachments/image-2'] })
  })

  it('shows an error when submitted expenses cannot be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, json: async () => ({ success: false, error: 'Insufficient permissions' }),
    }))
    render(<CampaignAssignmentDetails assignment={assignment} roleLabel="Lead NGO" project={project} />)
    await userEvent.click(screen.getByRole('button', { name: 'View my submitted expenses' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Insufficient permissions')
  })

  it('lets the lead read the verifier reason and correct a flagged expense', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: [{
        id: 'e1', category: 'materials', amount: 25, description: 'Timber', expense_date: '2026-01-01',
        approval_status: 'unreconciled', payment_status: 'unpaid', receipt_url: 'https://example.test/receipt',
        metadata: { review_reason: 'Provide invoice' },
      }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: [] }) })
    vi.stubGlobal('fetch', fetchMock)
    render(<CampaignAssignmentDetails assignment={assignment} roleLabel="Lead NGO" project={project} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'View my submitted expenses' }))
    expect(await screen.findByText('Verifier reason: Provide invoice')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Correct and resubmit' }))
    await user.click(screen.getByRole('button', { name: 'Resubmit expense' }))
    expect(await screen.findByText('Expense resubmitted for Evidence Verifier review.')).toBeInTheDocument()
    expect(fetchMock.mock.calls[1][0]).toBe('/api/csr-projects/project-1/expenses/e1/resubmit')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ amount: 25, receipt_url: 'https://example.test/receipt' })
  })

  it('shows upload errors without submitting the expense', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Upload unavailable' }) })
    vi.stubGlobal('fetch', fetchMock)
    render(<CampaignAssignmentDetails assignment={assignment} roleLabel="Lead NGO" project={project} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Amount (INR)'), '25')
    await user.type(screen.getByLabelText('Description'), 'Timber')
    await user.upload(screen.getByLabelText('Receipt or invoice image'), new File(['image'], 'receipt.png', { type: 'image/png' }))
    await user.click(screen.getByRole('button', { name: 'Submit expense' }))
    expect(await screen.findByText('Upload unavailable')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reuses an uploaded image when an expense submission is retried', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, url: '/api/csr-projects/project-1/attachments/image-1' }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Please retry' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) })
    vi.stubGlobal('fetch', fetchMock)
    render(<CampaignAssignmentDetails assignment={assignment} roleLabel="Lead NGO" project={project} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Amount (INR)'), '25')
    await user.type(screen.getByLabelText('Description'), 'Timber')
    await user.upload(screen.getByLabelText('Receipt or invoice image'), new File(['image'], 'receipt.png', { type: 'image/png' }))
    await user.click(screen.getByRole('button', { name: 'Submit expense' }))
    expect(await screen.findByText('Please retry')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Submit expense' }))
    expect(await screen.findByText(/Expense submitted/)).toBeInTheDocument()
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/api/csr-projects/project-1/attachments',
      '/api/csr-projects/project-1/expenses',
      '/api/csr-projects/project-1/expenses',
    ])
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).receipt_url).toBe('/api/csr-projects/project-1/attachments/image-1')
  })

  it('requires an image for a new expense before making any request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<CampaignAssignmentDetails assignment={assignment} roleLabel="Lead NGO" project={project} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Amount (INR)'), '25')
    await user.type(screen.getByLabelText('Description'), 'Timber')
    await user.click(screen.getByRole('button', { name: 'Submit expense' }))
    expect(await screen.findByText('Attach a receipt or invoice image.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('offers correction for unpaid rejected expenses but not approved expenses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: [
      { id: 'rejected', category: 'materials', amount: 25, description: 'Rejected invoice', expense_date: '2026-01-01', approval_status: 'rejected', payment_status: 'unpaid', metadata: { review_reason: 'Incorrect invoice' } },
      { id: 'approved', category: 'materials', amount: 30, description: 'Approved invoice', expense_date: '2026-01-01', approval_status: 'approved', payment_status: 'unpaid' },
    ] }) }))
    render(<CampaignAssignmentDetails assignment={assignment} roleLabel="Lead NGO" project={project} />)
    expect(screen.getByText(/Submit actual expenses before and throughout the project/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'View my submitted expenses' }))
    expect(await screen.findByText('Verifier reason: Incorrect invoice')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Correct and resubmit' })).toHaveLength(1)
  })
})
