let memoryToken: string | null = null

export function setClientSessionToken(token: string | null) {
  memoryToken = token
}

export function getClientSessionToken(): string | null {
  return memoryToken
}

export function clientAuthHeaders(extra: Record<string, string> = {}): HeadersInit {
  const token = memoryToken
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra
}

export function clientAuthFetchInit(init: RequestInit = {}): RequestInit {
  const extra =
    init.headers && !Array.isArray(init.headers) && !(init.headers instanceof Headers)
      ? (init.headers as Record<string, string>)
      : {}
  return {
    credentials: 'include',
    ...init,
    headers: clientAuthHeaders(extra),
  }
}
