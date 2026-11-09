export type WorkItemBucket = 'active' | 'history'

const HISTORY_STATUSES = new Set([
  'completed',
  'closed',
  'finished',
  'done',
  'ended',
  'cancelled',
  'canceled',
  'rejected',
  'expired',
])

export function normalizeWorkStatus(value: unknown): string {
  return String(value || '').toLowerCase().trim()
}

export function isHistoryWorkStatus(value: unknown): boolean {
  return HISTORY_STATUSES.has(normalizeWorkStatus(value))
}

export function getWorkItemBucket(...statuses: unknown[]): WorkItemBucket {
  return statuses.some((status) => isHistoryWorkStatus(status)) ? 'history' : 'active'
}

export function partitionByWorkBucket<T>(
  items: T[],
  statusOf: (item: T) => unknown[] | unknown,
): { active: T[]; history: T[] } {
  const active: T[] = []
  const history: T[] = []
  for (const item of items) {
    const statuses = statusOf(item)
    const bucket = getWorkItemBucket(...(Array.isArray(statuses) ? statuses : [statuses]))
    if (bucket === 'history') history.push(item)
    else active.push(item)
  }
  return { active, history }
}
