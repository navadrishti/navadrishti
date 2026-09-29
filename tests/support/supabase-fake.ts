import fs from 'node:fs'

export type FakeOp = 'select' | 'insert' | 'update' | 'upsert' | 'delete' | 'rpc'
export type FakeCall = [string, ...unknown[]]
export type FakeResult = { data?: unknown; error?: unknown; count?: number | null }

export type FakeQuery = {
  table: string
  op: FakeOp
  columns?: string
  returning?: string
  payload?: unknown
  options?: unknown
  /** Every builder call in order, including writes and terminal methods. */
  calls: FakeCall[]
  /** `select` and filter/modifier calls only. */
  filters: FakeCall[]
  throwOnError: boolean
}

export type FakeResponder = Record<string, FakeResult[]> | ((query: FakeQuery) => FakeResult | undefined)

const FILTER_METHODS = [
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in', 'not', 'or',
  'filter', 'match', 'contains', 'order', 'limit', 'range',
]
const WRITE_METHODS = ['insert', 'update', 'upsert', 'delete'] as const

/**
 * Object responders are queues keyed by `table.op` (or just `table` for any op), consumed in call
 * order; function responders see the query once its terminal method runs and fall back to the
 * queues when they return undefined. Unanswered queries resolve to `{ data: null, error: null }`.
 * `rpc(fn)` is recorded as a query on `fn` with op `rpc`.
 */
export function createSupabaseFake(responder: FakeResponder = {}) {
  const queries: FakeQuery[] = []
  const queues = new Map<string, FakeResult[]>()
  let handler: ((query: FakeQuery) => FakeResult | undefined) | null = null

  const use = (next: FakeResponder) => {
    queues.clear()
    handler = null
    if (typeof next === 'function') handler = next
    else for (const [key, list] of Object.entries(next)) queues.set(key, [...list])
  }
  use(responder)

  const respond = (query: FakeQuery) =>
    handler?.(query) ?? (queues.get(`${query.table}.${query.op}`) ?? queues.get(query.table))?.shift()

  const settle = (query: FakeQuery) => {
    const result = respond(query) ?? {}
    const value = { ...result, data: result.data ?? null, error: result.error ?? null }
    return query.throwOnError && value.error ? Promise.reject(value.error) : Promise.resolve(value)
  }

  const builderFor = (query: FakeQuery) => {
    queries.push(query)
    const builder: Record<string, unknown> = {}
    for (const method of FILTER_METHODS) {
      builder[method] = (...args: unknown[]) => {
        query.calls.push([method, ...args])
        query.filters.push([method, ...args])
        return builder
      }
    }
    builder.select = (...args: unknown[]) => {
      const columns = typeof args[0] === 'string' ? args[0] : '*'
      if (query.op === 'select') query.columns = columns
      else query.returning = columns
      query.calls.push(['select', ...args])
      query.filters.push(['select', ...args])
      return builder
    }
    for (const method of WRITE_METHODS) {
      builder[method] = (...args: unknown[]) => {
        query.op = method
        query.payload = args[0]
        query.options = args[1]
        query.calls.push([method, ...args])
        return builder
      }
    }
    builder.throwOnError = () => {
      query.throwOnError = true
      query.calls.push(['throwOnError'])
      return builder
    }
    for (const method of ['single', 'maybeSingle']) {
      builder[method] = () => {
        query.calls.push([method])
        return settle(query)
      }
    }
    builder.then = (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      settle(query).then(onFulfilled, onRejected)
    return builder
  }

  const from = (table: string) => builderFor({ table, op: 'select', calls: [], filters: [], throwOnError: false })

  const rpc = (fn: string, args?: unknown, options?: unknown) =>
    builderFor({ table: fn, op: 'rpc', payload: args, options, calls: [], filters: [], throwOnError: false })

  return {
    from,
    rpc,
    client: { from, rpc },
    queries,
    find: (table: string, op?: FakeOp) => queries.filter((query) => query.table === table && (!op || query.op === op)),
    writes: (table: string, op: FakeOp = 'update') => queries.filter((query) => query.table === table && query.op === op),
    queue(key: string, ...results: FakeResult[]) {
      queues.set(key, [...(queues.get(key) ?? []), ...results])
    },
    respondWith: use,
    reset(next: FakeResponder = {}) {
      queries.length = 0
      use(next)
    },
  }
}

/** Shared instance for `vi.mock` factories, which cannot reach module-level variables. */
export const supabaseFake = createSupabaseFake()

type ProgressRow = { current_amount?: unknown; current_quantity?: unknown }

/** Stand-in for `adjustServiceRequestProgress`: applies the delta to the row it was given. */
export async function fakeAdjustProgress<Row extends ProgressRow>(row: Row, delta: { amount?: number; quantity?: number }) {
  const next = (current: unknown, change = 0) => Number(Math.max(0, Number(current || 0) + change).toFixed(2))
  return {
    ...row,
    current_amount: next(row.current_amount, delta.amount),
    current_quantity: next(row.current_quantity, delta.quantity),
  }
}

export function callsOf(query: FakeQuery | undefined, method: string) {
  return (query?.calls || []).filter((call) => call[0] === method).map((call) => call.slice(1))
}

export function argOf(query: FakeQuery | undefined, method: string, index = 0): unknown {
  return callsOf(query, method)[0]?.[index]
}

export function hasCall(query: FakeQuery | undefined, ...call: unknown[]) {
  return Boolean(query?.calls.some((entry) => call.every((value, index) => entry[index] === value)))
}

export function eqValue(query: FakeQuery | undefined, column: string) {
  return query?.calls.find((entry) => entry[0] === 'eq' && entry[1] === column)?.[2]
}

export function eqsOf(query: FakeQuery | undefined) {
  return Object.fromEntries(callsOf(query, 'eq').map(([column, value]) => [String(column), value]))
}

export function compact(columns: string | undefined) {
  return String(columns || '').replace(/\s+/g, '')
}

let schemaCache: Map<string, Set<string>> | null = null

function schemaColumns() {
  if (schemaCache) return schemaCache
  const lines = fs.readFileSync(new URL('../../lib/database.types.ts', import.meta.url), 'utf8').split('\n')
  schemaCache = new Map()
  for (let index = 0; index < lines.length; index += 1) {
    const table = lines[index].match(/^ {6}(\w+): \{$/)
    if (!table || !/^ {8}Row: \{/.test(lines[index + 1] || '')) continue
    const columns = new Set<string>()
    for (let cursor = index + 2; cursor < lines.length && !/^ {8}\}/.test(lines[cursor]); cursor += 1) {
      const column = lines[cursor].match(/^ {10}(\w+)\??:/)
      if (column) columns.add(column[1])
    }
    schemaCache.set(table[1], columns)
  }
  return schemaCache
}

function splitTopLevel(text: string) {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of text) {
    if (char === '(') depth += 1
    if (char === ')') depth -= 1
    if (char === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else {
      current += char
    }
  }
  if (current) parts.push(current)
  return parts.map((part) => part.trim()).filter(Boolean)
}

function selectProblems(table: string, select: string, problems: string[]) {
  const schema = schemaColumns()
  const known = schema.get(table)
  if (!known) {
    problems.push(`unknown table ${table}`)
    return
  }
  for (const part of splitTopLevel(compact(select))) {
    const embed = part.match(/^(?:\w+:)?(\w+)(?:!(\w+))?\((.*)\)$/)
    if (embed) {
      const [, child, hint, inner] = embed
      if (hint && !known.has(hint) && !schema.get(child)?.has(hint)) problems.push(`${table}->${child}!${hint}`)
      selectProblems(child, inner, problems)
      continue
    }
    const column = part.replace(/^\w+:/, '')
    if (column !== '*' && !known.has(column)) problems.push(`${table}.${column}`)
  }
}

const COLUMN_FILTERS = ['eq', 'neq', 'in', 'not', 'is', 'lt', 'lte', 'gt', 'gte', 'order', 'ilike', 'like', 'contains']

/** Columns referenced by the queries that do not exist in lib/database.types.ts. */
export function unknownColumns(queries: FakeQuery[]) {
  const problems: string[] = []
  for (const query of queries) {
    if (query.op === 'rpc') continue
    const known = schemaColumns().get(query.table)
    if (query.columns) selectProblems(query.table, query.columns, problems)
    if (query.returning) selectProblems(query.table, query.returning, problems)
    if (!known) continue
    for (const [method, column] of query.calls) {
      if (COLUMN_FILTERS.includes(method) && typeof column === 'string' && !column.includes('->') && !known.has(column)) {
        problems.push(`${query.table}.${column} (${method})`)
      }
      if (method === 'or' && typeof column === 'string') {
        for (const clause of column.split(',')) {
          const name = clause.split('.')[0]
          if (!known.has(name)) problems.push(`${query.table}.${name} (or)`)
        }
      }
    }
    const rows = Array.isArray(query.payload) ? query.payload : query.payload ? [query.payload] : []
    for (const row of rows) {
      for (const key of Object.keys(row as Record<string, unknown>)) {
        if (!known.has(key)) problems.push(`${query.table}.${key} (${query.op})`)
      }
    }
  }
  return problems
}
