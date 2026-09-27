import crypto from 'node:crypto'

export type FakeOp = { method: string; args: unknown[] }
export type FakeQuery = { table: string; ops: FakeOp[] }
export type FakeResult = { data?: unknown; error?: unknown } | undefined

const CHAIN_METHODS = ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'neq', 'is', 'in', 'order', 'limit']

export function createSupabaseFake(respond: (query: FakeQuery) => FakeResult = () => undefined) {
  const queries: FakeQuery[] = []

  const from = (table: string) => {
    const query: FakeQuery = { table, ops: [] }
    queries.push(query)
    const resolve = () => Promise.resolve({ data: null, error: null, ...respond(query) })
    const builder: Record<string, unknown> = {}
    for (const method of CHAIN_METHODS) {
      builder[method] = (...args: unknown[]) => {
        query.ops.push({ method, args })
        return builder
      }
    }
    for (const method of ['single', 'maybeSingle']) {
      builder[method] = () => {
        query.ops.push({ method, args: [] })
        return resolve()
      }
    }
    builder.then = (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      resolve().then(onFulfilled, onRejected)
    return builder
  }

  const find = (table: string, method?: string) =>
    queries.filter((query) => query.table === table && (!method || has(query, method)))

  return { from, queries, find }
}

export function has(query: FakeQuery, method: string) {
  return query.ops.some((op) => op.method === method)
}

export function arg(query: FakeQuery | undefined, method: string, index = 0): unknown {
  return query?.ops.find((op) => op.method === method)?.args[index]
}

export function sign(orderId: string, paymentId: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex')
}
