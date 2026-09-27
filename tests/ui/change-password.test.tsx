import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import EvidenceVerificationChangePasswordPage from '@/app/evidence-verification/change-password/page'
import { jsonResponse, mockFetch, requestBody } from './helpers'
import { router } from './mocks/navigation'

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))

function serve(changeResponse: Response = jsonResponse({ success: true })) {
  return mockFetch((url) => {
    if (url === '/api/evidence-verification/verify') return jsonResponse({ identity: { must_change_password: true } })
    return changeResponse
  })
}

async function fill(current: string, next: string, confirm: string) {
  await userEvent.type(screen.getByLabelText('Current password'), current)
  await userEvent.type(screen.getByLabelText('New password'), next)
  await userEvent.type(screen.getByLabelText('Confirm new password'), confirm)
  await userEvent.click(screen.getByRole('button', { name: 'Update password' }))
}

function changeCalls(fetchMock: ReturnType<typeof serve>) {
  return fetchMock.mock.calls.filter(([url]) => url === '/api/evidence-verification/change-password')
}

describe('EvidenceVerificationChangePasswordPage', () => {
  it('rejects a short new password', async () => {
    const fetchMock = serve()
    render(<EvidenceVerificationChangePasswordPage />)

    await fill('temp-pass', 'short', 'short')

    expect(await screen.findByText('New password must be at least 8 characters')).toBeInTheDocument()
    expect(changeCalls(fetchMock)).toHaveLength(0)
  })

  it('rejects mismatched passwords', async () => {
    const fetchMock = serve()
    render(<EvidenceVerificationChangePasswordPage />)

    await fill('temp-pass', 'new-password-1', 'new-password-2')

    expect(await screen.findByText('New passwords do not match')).toBeInTheDocument()
    expect(changeCalls(fetchMock)).toHaveLength(0)
  })

  it('submits and redirects on success', async () => {
    const fetchMock = serve()
    render(<EvidenceVerificationChangePasswordPage />)

    await fill('temp-pass', 'new-password-1', 'new-password-1')

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/evidence-verification'))
    const [call] = changeCalls(fetchMock)
    expect(requestBody(call[1])).toEqual({ current_password: 'temp-pass', new_password: 'new-password-1' })
  })

  it('shows the server error', async () => {
    serve(jsonResponse({ error: 'Current password is incorrect' }, 400))
    render(<EvidenceVerificationChangePasswordPage />)

    await fill('wrong', 'new-password-1', 'new-password-1')

    expect(await screen.findByText('Current password is incorrect')).toBeInTheDocument()
    expect(router.push).not.toHaveBeenCalledWith('/evidence-verification')
  })

  it('redirects to login without a session', async () => {
    mockFetch(() => jsonResponse({ error: 'Unauthorized' }, 401))
    render(<EvidenceVerificationChangePasswordPage />)
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/evidence-verification/login'))
  })

  it('redirects to the dashboard when no change is required', async () => {
    mockFetch(() => jsonResponse({ identity: { must_change_password: false } }))
    render(<EvidenceVerificationChangePasswordPage />)
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/evidence-verification'))
  })
})
