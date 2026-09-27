import { render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth, type User } from '@/lib/auth-context'
import { jsonResponse, mockFetch, requestBody } from './helpers'

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))

const alice: User = { id: 7, email: 'alice@example.com', name: 'Alice', user_type: 'individual' }

function AuthProbe() {
  const { user, token, loading, error, login, logout } = useAuth()
  return (
    <div>
      <p>loading: {String(loading)}</p>
      <p>user: {user?.name ?? 'none'}</p>
      <p>token: {token ?? 'none'}</p>
      <p>error: {error ?? 'none'}</p>
      <button onClick={() => void login('alice@example.com', 'secret123')}>login</button>
      <button onClick={() => void logout()}>logout</button>
    </div>
  )
}

function renderWithAuth() {
  return render(
    <AuthProvider>
      <AuthProbe />
    </AuthProvider>,
  )
}

describe('AuthProvider', () => {
  it('finishes loading with no user when storage is empty', async () => {
    const fetchMock = mockFetch(() => jsonResponse({}, 500))
    renderWithAuth()

    await screen.findByText('loading: false')
    expect(screen.getByText('user: none')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('hydrates a stored session from /api/auth/me', async () => {
    localStorage.setItem('token', 'stored-token')
    localStorage.setItem('user', JSON.stringify({ ...alice, name: 'Stale Alice' }))
    const fetchMock = mockFetch((url) => (url === '/api/auth/me' ? jsonResponse({ user: alice }) : jsonResponse({}, 404)))

    renderWithAuth()

    await screen.findByText('user: Alice')
    await screen.findByText('loading: false')
    expect(screen.getByText('token: stored-token')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', {
      headers: { Authorization: 'Bearer stored-token' },
    })
    expect(JSON.parse(localStorage.getItem('user') ?? '{}').name).toBe('Alice')
  })

  it('clears a stored session rejected by the server', async () => {
    localStorage.setItem('token', 'expired-token')
    localStorage.setItem('user', JSON.stringify(alice))
    mockFetch(() => jsonResponse({ error: 'Unauthorized' }, 401))

    renderWithAuth()

    await screen.findByText('loading: false')
    expect(screen.getByText('user: none')).toBeInTheDocument()
    expect(screen.getByText('token: none')).toBeInTheDocument()
    expect(localStorage.getItem('token')).toBeNull()
    expect(localStorage.getItem('user')).toBeNull()
  })

  it('logs in and persists the token and user', async () => {
    const fetchMock = mockFetch((url) => {
      if (url === '/api/auth/login') return jsonResponse({ token: 'new-token', user: alice })
      if (url === '/api/auth/me') return jsonResponse({ user: alice })
      return jsonResponse({}, 404)
    })
    renderWithAuth()
    await screen.findByText('loading: false')

    await userEvent.click(screen.getByRole('button', { name: 'login' }))

    await screen.findByText('user: Alice')
    await screen.findByText('loading: false')
    expect(screen.getByText('token: new-token')).toBeInTheDocument()
    expect(localStorage.getItem('token')).toBe('new-token')
    expect(sessionStorage.getItem('token')).toBe('new-token')
    expect(JSON.parse(localStorage.getItem('user') ?? '{}').id).toBe(7)

    const loginCall = fetchMock.mock.calls.find(([url]) => url === '/api/auth/login')
    expect(requestBody(loginCall?.[1])).toEqual({ email: 'alice@example.com', password: 'secret123' })
  })

  it('shows the server error when login fails', async () => {
    mockFetch(() => jsonResponse({ error: 'Invalid email or password' }, 401))
    renderWithAuth()
    await screen.findByText('loading: false')

    await userEvent.click(screen.getByRole('button', { name: 'login' }))

    await screen.findByText('error: Invalid email or password')
    expect(screen.getByText('user: none')).toBeInTheDocument()
    expect(screen.getByText('loading: false')).toBeInTheDocument()
    expect(localStorage.getItem('token')).toBeNull()
  })

  it('stays loading while login is in flight', async () => {
    let resolveLogin: (response: Response) => void = () => {}
    mockFetch((url) => {
      if (url === '/api/auth/login') return new Promise<Response>((resolve) => { resolveLogin = resolve })
      return jsonResponse({ user: alice })
    })
    renderWithAuth()
    await screen.findByText('loading: false')

    await userEvent.click(screen.getByRole('button', { name: 'login' }))
    expect(screen.getByText('loading: true')).toBeInTheDocument()

    resolveLogin(jsonResponse({ token: 'new-token', user: alice }))
    await screen.findByText('user: Alice')
    await screen.findByText('loading: false')
  })

  it('logs out, clears storage and blocks rehydration', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    localStorage.setItem('token', 'stored-token')
    localStorage.setItem('user', JSON.stringify(alice))
    const fetchMock = mockFetch((url) => (url === '/api/auth/me' ? jsonResponse({ user: alice }) : jsonResponse({ success: true })))

    renderWithAuth()
    await screen.findByText('user: Alice')

    await userEvent.click(screen.getByRole('button', { name: 'logout' }))

    await screen.findByText('user: none')
    expect(screen.getByText('token: none')).toBeInTheDocument()
    expect(localStorage.getItem('token')).toBeNull()
    expect(localStorage.getItem('user')).toBeNull()
    expect(sessionStorage.getItem('navadrishti:auth-revoked')).toBe('1')
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({ method: 'POST' }))
  })

  it('throws when useAuth is used outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useAuth())).toThrow('useAuth must be used within an AuthProvider')
  })

  it('rehydrates when another tab stores a token', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ user: alice }))
    renderWithAuth()
    await screen.findByText('loading: false')

    window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }))
    localStorage.setItem('token', 'other-tab-token')
    window.dispatchEvent(new StorageEvent('storage', { key: 'token' }))

    await screen.findByText('user: Alice')
    await waitFor(() => expect(screen.getByText('token: other-tab-token')).toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalled()
  })
})
