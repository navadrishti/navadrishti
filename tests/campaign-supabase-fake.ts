import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'

export type FakeCall = [string, ...unknown[]]

export type FakeQuery = {
  table: string
  op: 'select' | 'insert' | 'update' | 'delete' | 'upsert'
  payload?: unknown
  calls: FakeCall[]
}

export type FakeResult = { data?: unknown; error?: unknown }

const CHAIN_METHODS = ['select', 'eq', 'or', 'neq', 'in', 'not', 'is', 'order', 'limit', 'throwOnError', 'match', 'filter']
const WRITE_METHODS = ['insert', 'update', 'delete', 'upsert'] as const

function createSupabaseFake() {
  const state = {
    queries: [] as FakeQuery[],
    respond: (_query: FakeQuery): FakeResult | undefined => undefined,
  }

  function from(table: string) {
    const query: FakeQuery = { table, op: 'select', calls: [] }
    state.queries.push(query)
    const resolve = () => Promise.resolve({ data: null, error: null, ...state.respond(query) })
    const builder: Record<string, unknown> = {}
    for (const method of CHAIN_METHODS) {
      builder[method] = (...args: unknown[]) => {
        query.calls.push([method, ...args])
        return builder
      }
    }
    for (const method of WRITE_METHODS) {
      builder[method] = (...args: unknown[]) => {
        query.op = method
        query.payload = args[0]
        query.calls.push([method, ...args])
        return builder
      }
    }
    builder.maybeSingle = () => {
      query.calls.push(['maybeSingle'])
      return resolve()
    }
    builder.single = () => {
      query.calls.push(['single'])
      return resolve()
    }
    builder.then = (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      resolve().then(onFulfilled, onRejected)
    return builder
  }

  return {
    client: { from },
    get queries() {
      return state.queries
    },
    respondWith(respond: (query: FakeQuery) => FakeResult | undefined) {
      state.respond = respond
    },
    reset() {
      state.queries = []
      state.respond = () => undefined
    },
    find(table: string, op: FakeQuery['op'] = 'select') {
      return state.queries.filter((query) => query.table === table && query.op === op)
    },
  }
}

export const supabaseFake = createSupabaseFake()

export function hasCall(query: FakeQuery | undefined, ...call: unknown[]) {
  return Boolean(query?.calls.some((entry) => call.every((value, index) => entry[index] === value)))
}

export function eqValue(query: FakeQuery, column: string) {
  return query.calls.find((entry) => entry[0] === 'eq' && entry[1] === column)?.[2]
}

export function tokenFor(id: number, userType: string) {
  return jwt.sign({ id, email: `user${id}@example.org`, user_type: userType }, 'test-secret')
}

export function jsonRequest(url: string, options: { token?: string; body?: unknown; method?: string } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (options.token) headers.authorization = `Bearer ${options.token}`
  return new NextRequest(url, {
    method: options.method || (options.body === undefined ? 'GET' : 'POST'),
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  })
}
