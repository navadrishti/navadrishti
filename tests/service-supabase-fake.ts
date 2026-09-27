export type FakeResult = { data?: unknown; error?: unknown }

export type FakeCall = {
  table: string
  op: 'select' | 'insert' | 'update' | 'upsert' | 'delete'
  payload?: unknown
  filters: unknown[][]
  throwOnError: boolean
}

const FILTER_METHODS = [
  'select', 'eq', 'neq', 'in', 'not', 'is', 'lt', 'lte', 'gt', 'gte',
  'or', 'order', 'limit', 'range', 'match', 'ilike', 'contains',
]

const WRITE_METHODS = ['insert', 'update', 'upsert', 'delete'] as const

/**
 * Responses are keyed by `table.op` and consumed in call order;
 * unconfigured calls resolve to `{ data: null, error: null }`.
 */
export function createSupabaseFake(responses: Record<string, FakeResult[]> = {}) {
  const queues = new Map(Object.entries(responses).map(([key, list]) => [key, [...list]]))
  const calls: FakeCall[] = []

  const resolve = (call: FakeCall) => {
    const next = queues.get(`${call.table}.${call.op}`)?.shift() ?? {}
    const result = { data: next.data ?? null, error: next.error ?? null }
    if (call.throwOnError && result.error) return Promise.reject(result.error)
    return Promise.resolve(result)
  }

  const from = (table: string) => {
    const call: FakeCall = { table, op: 'select', filters: [], throwOnError: false }
    calls.push(call)
    const builder: Record<string, unknown> = {}
    for (const name of FILTER_METHODS) {
      builder[name] = (...args: unknown[]) => {
        call.filters.push([name, ...args])
        return builder
      }
    }
    for (const op of WRITE_METHODS) {
      builder[op] = (payload?: unknown) => {
        call.op = op
        call.payload = payload
        return builder
      }
    }
    builder.throwOnError = () => {
      call.throwOnError = true
      return builder
    }
    builder.single = () => resolve(call)
    builder.maybeSingle = () => resolve(call)
    builder.then = (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      resolve(call).then(onFulfilled, onRejected)
    return builder
  }

  const writes = (table: string, op: FakeCall['op'] = 'update') =>
    calls.filter((call) => call.table === table && call.op === op)

  return { from, calls, writes }
}
