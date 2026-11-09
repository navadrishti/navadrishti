import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectOpsReviewSection } from '@/app/evidence-verification/verification-panel/project-ops-review-section'
import type { CsrProjectSummary } from '@/app/evidence-verification/verification-panel/types'

const projects = [
  { id: 'p1', title: 'Water project' },
  { id: 'p2', title: 'Forest project' },
] as CsrProjectSummary[]

function response(data: unknown, ok = true) {
  return { ok, json: async () => data }
}

afterEach(() => vi.unstubAllGlobals())

describe('project expense review queue', () => {
  it('loads all assigned projects automatically and separates active and reviewed expenses', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/csr-projects/p1/expenses') return response({ success: true, data: [
        { id: 'e1', category: 'materials', amount: 100, description: 'Timber', approval_status: 'proposed', expense_date: '2026-01-01' },
        { id: 'e2', category: 'other', amount: 20, description: 'Approved item', approval_status: 'approved' },
      ] })
      if (url === '/api/csr-projects/p2/expenses') return response({ success: true, data: [
        { id: 'e3', category: 'equipment', amount: 50, description: 'Needs investigation', approval_status: 'unreconciled' },
        { id: 'e4', category: 'other', amount: 10, description: 'Rejected item', approval_status: 'rejected', metadata: { review_reason: 'Missing receipt' } },
      ] })
      throw new Error(`Unexpected request ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<ProjectOpsReviewSection projects={projects} />)
    expect(await screen.findByText('Timber')).toBeInTheDocument()
    expect(screen.queryByText('Needs investigation')).not.toBeInTheDocument()
    expect(screen.queryByText('Approved item')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Active (1)' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'History (3)' }))
    expect(screen.getByText('Approved item')).toBeInTheDocument()
    expect(screen.getByText('Rejected item')).toBeInTheDocument()
    expect(screen.getByText('Needs investigation')).toBeInTheDocument()
    expect(screen.getByText('Review reason: Missing receipt')).toBeInTheDocument()
    expect(screen.queryByText('Timber')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('reports per-project loading failures rather than presenting them as empty results', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.includes('/p1/') ? response({ success: false, error: 'Access denied' }, false) : response({ success: true, data: [] })
    ))
    render(<ProjectOpsReviewSection projects={projects} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Water project: Access denied')
    expect(screen.getByRole('alert')).toHaveTextContent('Counts exclude these projects')
  })

  it('distinguishes an empty assigned scope from an empty queue', async () => {
    vi.stubGlobal('fetch', vi.fn())
    render(<ProjectOpsReviewSection projects={[]} />)
    expect(await screen.findByText('No projects are assigned to your verification scope.')).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('keeps an unreconciled expense in history without review controls', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/csr-projects/p1/expenses') return response({ success: true, data: [
        { id: 'e1', category: 'materials', amount: 100, description: 'Needs review', approval_status: 'unreconciled' },
      ] })
      if (url === '/api/csr-projects/p1/materials') return response({ success: true, data: [] })
      if (url === '/api/evidence-verification/project-finance/p1') return response({ success: true, data: { materials: [] } })
      throw new Error(`Unexpected request ${url}`)
    }))
    render(<ProjectOpsReviewSection projects={[projects[0]]} />)
    fireEvent.click(await screen.findByRole('button', { name: 'History (1)' }))
    expect(screen.getByText('Needs review')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
  })

  it('moves a flagged expense to history and back to active after resubmission', async () => {
    let status = 'proposed'
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/review')) {
        status = 'unreconciled'
        return response({ success: true })
      }
      return response({ success: true, data: [{ id: 'e1', description: 'Timber', approval_status: status }] })
    }))
    render(<ProjectOpsReviewSection projects={[projects[0]]} />)
    await screen.findByText('Timber')
    fireEvent.change(screen.getByLabelText('Review reason (required to reject or flag)'), { target: { value: 'Provide invoice' } })
    fireEvent.click(screen.getByRole('button', { name: 'Flag for reconciliation' }))
    expect(await screen.findByRole('button', { name: 'History (1)' })).toBeInTheDocument()
    expect(screen.queryByText('Timber')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'History (1)' }))
    expect(screen.getByText('Timber')).toBeInTheDocument()
    status = 'proposed'
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(await screen.findByRole('button', { name: 'Active (1)' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Active (1)' }))
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
  })

  it('shows the previous verifier reason on a resubmitted expense', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ success: true, data: [{
      id: 'e1', description: 'Updated invoice', amount: 30, approval_status: 'proposed',
      metadata: { resubmission_history: [{ description: 'Original invoice', amount: 25, review_reason: 'Provide invoice' }] },
    }] })))
    render(<ProjectOpsReviewSection projects={[projects[0]]} />)
    await screen.findByText('Updated invoice')
    fireEvent.click(screen.getByText('Previous flagged submissions (1)'))
    expect(screen.getByText(/Original invoice.*Verifier reason: Provide invoice/)).toBeInTheDocument()
  })

  it('reviews the correct expense directly without opening project details', async () => {
    let status = 'proposed'
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/e1/review')) {
        expect(init?.method).toBe('POST')
        status = 'approved'
        return response({ success: true })
      }
      if (url === '/api/csr-projects/p1/expenses') return response({ success: true, data: [
        { id: 'e1', category: 'materials', amount: 100, description: 'Timber', approval_status: status },
      ] })
      if (url === '/api/csr-projects/p1/materials') return response({ success: true, data: [] })
      if (url === '/api/evidence-verification/project-finance/p1') return response({ success: true, data: { title: 'Water project', materials: [] } })
      throw new Error(`Unexpected request ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<ProjectOpsReviewSection projects={[projects[0]]} />)
    await screen.findByText('Timber')
    const approve = screen.getByRole('button', { name: 'Approve' })
    fireEvent.click(approve)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/csr-projects/p1/expenses/e1/review', expect.objectContaining({ method: 'POST' })
    ))
    const history = await screen.findByRole('button', { name: 'History (1)' })
    fireEvent.click(history)
    expect(within(screen.getByText('Water project').closest('.rounded-md') as HTMLElement).getByText('Timber')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
  })

  it('shows only projects with expenses in the selected tab, without an unrelated project list', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => response({ success: true, data:
      url.includes('/p1/') ? [{ id: 'e1', description: 'Submitted', approval_status: 'proposed' }] : [],
    })))
    render(<ProjectOpsReviewSection projects={projects} />)
    await screen.findByText('Submitted')
    expect(screen.getByText('Water project')).toBeInTheDocument()
    expect(screen.queryByText('Forest project')).not.toBeInTheDocument()
    expect(screen.queryByText('Material review and project finance details')).not.toBeInTheDocument()
  })

  it('requires a reason and submits rejection against the correct expense', async () => {
    let status = 'proposed'
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/e1/review')) {
        status = 'rejected'
        return response({ success: true })
      }
      return response({ success: true, data: [{ id: 'e1', description: 'Receipt', approval_status: status }] })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<ProjectOpsReviewSection projects={[projects[0]]} />)
    await screen.findByText('Receipt')
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a review reason')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    fireEvent.change(screen.getByLabelText('Review reason (required to reject or flag)'), { target: { value: 'Receipt is incomplete' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/csr-projects/p1/expenses/e1/review',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ action: 'reject', reason: 'Receipt is incomplete' }) })
    ))
    expect(await screen.findByRole('button', { name: 'History (1)' })).toBeInTheDocument()
  })

  it('shows a review failure on the submitted expense and does not change tabs', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/review')
      ? response({ success: false, error: 'Review permission required' }, false)
      : response({ success: true, data: [{ id: 'e1', description: 'Expense A', approval_status: 'proposed' }] })))
    render(<ProjectOpsReviewSection projects={[projects[0]]} />)
    await screen.findByText('Expense A')
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Review permission required')
    expect(screen.getByRole('button', { name: 'Active (1)' })).toBeInTheDocument()
  })
})
