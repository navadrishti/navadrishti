export class ServiceRequestDeleteBlockedError extends Error {
  constructor(message = 'This need has payment records and cannot be deleted.') {
    super(message)
    this.name = 'ServiceRequestDeleteBlockedError'
  }
}

export class NeedCapacityExceededError extends Error {
  constructor(message = 'This need no longer has enough capacity left. Refresh and try again.') {
    super(message)
    this.name = 'NeedCapacityExceededError'
  }
}

export function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: unknown }).code === '23505')
}

/** PostgREST reports a missing RPC as PGRST202; Postgres as 42883. */
export function isMissingRpcFunction(error: unknown): boolean {
  const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : null
  return code === '42883' || code === 'PGRST202'
}
