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
