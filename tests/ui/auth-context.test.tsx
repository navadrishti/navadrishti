import { render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth, type User } from '@/lib/auth-context'
import { jsonResponse, mockFetch, requestBody } from './helpers'

const supabaseAuth = vi.hoisted(() => ({
  getSession: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({ auth: supabaseAuth }),
}))

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))

const alice: User = { id: 7, email: 'alice@example.com', name: 'Alice', user_type: 'individual' }
const bob: User = { id: 9, email: 'bob@example.com', name: 'Bob', user_type: 'individual' }

function AuthProbe() {
  const { user, token, loading, error, login, signup, logout } = useAuth()
  return (
    <div>
      <p>loading: {String(loading)}</p>
      <p>user: {user?.name ?? 'none'}</p>
      <p>token: {token ?? 'none'}</p>
      <p>error: {error ?? 'none'}</p>
      <button onClick={() => void login('alice@example.com', 'secret123')}>login</button>
      <button
        onClick={() =>
          void signup({
            email: 'bob@example.com',
            password: 'secret123',
            name: 'Bob',
            user_type: 'individual',
            phone: '9876543210',
          }).catch(() => {})
        }
      >
        signup
      </button>
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
  beforeEach(() => {
    supabaseAuth.getSession.mockReset().mockResolvedValue({ data: { session: null }, error: null })
    supabaseAuth.signOut.mockReset().mockResolvedValue({ error: null })
  })

  it('creates an account, keeps the session, and forwards the OTP access token', async () => {
    supabaseAuth.getSession.mockResolvedValue({
      data: { session: { access_token: 'otp-access' } },
      error: null,
    })
    const fetchMock = mockFetch((url, init) => {
      if (url === '/api/auth/signup') return jsonResponse({ token: 'signup-token', user: bob }, 201)
      const headers = new Headers(init?.headers)
      if (url === '/api/auth/me' && !headers.get('authorization')) {
        return jsonResponse({ error: 'Unauthorized' }, 401)
      }
      if (url === '/api/auth/me') return jsonResponse({ user: bob, token: 'me-token' })
      return jsonResponse({}, 404)
    })
    renderWithAuth()
    await screen.findByText('loading: false')

    await userEvent.click(screen.getByRole('button', { name: 'signup' }))

    await screen.findByText('user: Bob')
    await screen.findByText('loading: false')
    expect(screen.getByText('token: me-token')).toBeInTheDocument()
    expect(localStorage.getItem('token')).toBeNull()
    expect(JSON.parse(localStorage.getItem('user') ?? '{}').id).toBe(9)

    const signupCall = fetchMock.mock.calls.find(([url]) => url === '/api/auth/signup')
    expect(signupCall?.[1]).toEqual(expect.objectContaining({ credentials: 'include' }))
    expect(requestBody(signupCall?.[1])).toMatchObject({
      email: 'bob@example.com',
      name: 'Bob',
      user_type: 'individual',
      phone: '9876543210',
      email_verification_token: 'otp-access',
    })
    expect(supabaseAuth.signOut).toHaveBeenCalled()
  })

  it('still creates the account if the OTP session cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    supabaseAuth.getSession.mockRejectedValue(new Error('Refusing to create a browser Supabase client with the secret key.'))
    mockFetch((url, init) => {
      if (url === '/api/auth/signup') return jsonResponse({ token: 'signup-token', user: bob }, 201)
      const headers = new Headers(init?.headers)
      if (url === '/api/auth/me' && headers.get('authorization')) {
        return jsonResponse({ user: bob })
      }
      return jsonResponse({ error: 'Unauthorized' }, 401)
    })
    renderWithAuth()
    await screen.findByText('loading: false')

    await userEvent.click(screen.getByRole('button', { name: 'signup' }))

    await screen.findByText('user: Bob')
    expect(screen.queryByText('error: none')).toBeInTheDocument()
  })

  it('keeps the newly created account when /api/auth/me returns 401', async () => {
    supabaseAuth.getSession.mockResolvedValue({ data: { session: null }, error: null })
    mockFetch((url) => {
      if (url === '/api/auth/signup') return jsonResponse({ token: 'signup-token', user: bob }, 201)
      return jsonResponse({ error: 'Unauthorized' }, 401)
    })
    renderWithAuth()
    await screen.findByText('loading: false')

    await userEvent.click(screen.getByRole('button', { name: 'signup' }))

    await screen.findByText('user: Bob')
    expect(screen.getByText('token: signup-token')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('user') ?? '{}').name).toBe('Bob')
  })

  it('shows the server error when signup fails', async () => {
    supabaseAuth.getSession.mockResolvedValue({ data: { session: null }, error: null })
    mockFetch((url) => {
      if (url === '/api/auth/signup') {
        return jsonResponse({ error: 'User with this email already exists' }, 409)
      }
      return jsonResponse({ error: 'Unauthorized' }, 401)
    })
    renderWithAuth()
    await screen.findByText('loading: false')

    await userEvent.click(screen.getByRole('button', { name: 'signup' }))

    await screen.findByText('error: An account with this email already exists. Please log in or use a different email.')
    expect(screen.getByText('user: none')).toBeInTheDocument()
  })

  it('finishes loading with no user when storage is empty', async () => {
    const fetchMock = mockFetch(() => jsonResponse({ error: 'Unauthorized' }, 401))
    renderWithAuth()

    await screen.findByText('loading: false')
    expect(screen.getByText('user: none')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', expect.objectContaining({ credentials: 'include' }))
  })

  it('hydrates a stored session from /api/auth/me', async () => {
    localStorage.setItem('token', 'stored-token')
    localStorage.setItem('user', JSON.stringify({ ...alice, name: 'Stale Alice' }))
    const fetchMock = mockFetch((url) => (url === '/api/auth/me' ? jsonResponse({ user: alice }) : jsonResponse({}, 404)))

    renderWithAuth()

    await screen.findByText('user: Alice')
    await screen.findByText('loading: false')
    expect(screen.getByText('token: stored-token')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', expect.objectContaining({
      credentials: 'include',
      headers: { Authorization: 'Bearer stored-token' },
    }))
    expect(localStorage.getItem('token')).toBeNull()
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
    expect(localStorage.getItem('token')).toBeNull()
    expect(sessionStorage.getItem('token')).toBeNull()
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
    mockFetch((url, init) => {
      if (url === '/api/auth/login') return new Promise<Response>((resolve) => { resolveLogin = resolve })
      const headers = new Headers(init?.headers)
      if (url === '/api/auth/me' && !headers.get('authorization')) {
        return jsonResponse({ error: 'Unauthorized' }, 401)
      }
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

  it('ignores a leftover sessionStorage token when localStorage is empty', async () => {
    sessionStorage.setItem('token', 'stale-tab-token')
    sessionStorage.setItem('user', JSON.stringify(alice))
    const fetchMock = mockFetch(() => jsonResponse({ error: 'Unauthorized' }, 401))

    renderWithAuth()

    await screen.findByText('loading: false')
    expect(screen.getByText('user: none')).toBeInTheDocument()
    expect(screen.getByText('token: none')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', expect.objectContaining({ credentials: 'include' }))
  })

  it('logs this tab out when another tab clears the shared user', async () => {
    localStorage.setItem('token', 'stored-token')
    localStorage.setItem('user', JSON.stringify(alice))
    mockFetch((url) => {
      if (url !== '/api/auth/me') return jsonResponse({}, 404)
      if (!localStorage.getItem('user')) return jsonResponse({ error: 'Unauthorized' }, 401)
      return jsonResponse({ user: alice })
    })

    renderWithAuth()
    await screen.findByText('user: Alice')

    localStorage.removeItem('token')
    localStorage.removeItem('user')
    window.dispatchEvent(new StorageEvent('storage', { key: 'user' }))

    await screen.findByText('user: none')
    expect(screen.getByText('token: none')).toBeInTheDocument()
  })

  it('picks up a login from another tab even after this tab logged out', async () => {
    sessionStorage.setItem('navadrishti:auth-revoked', '1')
    const fetchMock = mockFetch((url) => {
      if (url !== '/api/auth/me') return jsonResponse({}, 404)
      if (!localStorage.getItem('user') && !localStorage.getItem('token')) {
        return jsonResponse({ error: 'Unauthorized' }, 401)
      }
      return jsonResponse({ user: alice })
    })
    renderWithAuth()
    await screen.findByText('loading: false')

    localStorage.setItem('token', 'other-tab-token')
    localStorage.setItem('user', JSON.stringify(alice))
    window.dispatchEvent(new StorageEvent('storage', { key: 'user' }))

    await screen.findByText('user: Alice')
    await waitFor(() => expect(screen.getByText('token: other-tab-token')).toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalled()
  })

  it('does not flip loading or refetch when the window is focused', async () => {
    localStorage.setItem('user', JSON.stringify(alice))
    const fetchMock = mockFetch((url) => (url === '/api/auth/me' ? jsonResponse({ user: alice, token: 'me-token' }) : jsonResponse({}, 404)))
    renderWithAuth()
    await screen.findByText('user: Alice')
    await screen.findByText('loading: false')
    const callsAfterHydrate = fetchMock.mock.calls.length

    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))

    expect(screen.getByText('loading: false')).toBeInTheDocument()
    expect(screen.getByText('user: Alice')).toBeInTheDocument()
    expect(fetchMock.mock.calls.length).toBe(callsAfterHydrate)
  })

  it('rehydrates when another tab stores a session user', async () => {
    const fetchMock = mockFetch((url) => {
      if (url !== '/api/auth/me') return jsonResponse({}, 404)
      if (!localStorage.getItem('user') && !localStorage.getItem('token')) {
        return jsonResponse({ error: 'Unauthorized' }, 401)
      }
      return jsonResponse({ user: alice })
    })
    renderWithAuth()
    await screen.findByText('loading: false')

    window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }))
    localStorage.setItem('token', 'other-tab-token')
    localStorage.setItem('user', JSON.stringify(alice))
    window.dispatchEvent(new StorageEvent('storage', { key: 'user' }))

    await screen.findByText('user: Alice')
    await waitFor(() => expect(screen.getByText('token: other-tab-token')).toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalled()
  })
})
