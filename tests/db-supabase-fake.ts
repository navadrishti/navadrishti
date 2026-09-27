import fs from 'node:fs'

export type DbOp = 'select' | 'insert' | 'update' | 'upsert' | 'delete'
export type DbResult = { data?: unknown; error?: unknown }
export type DbCall = [string, ...unknown[]]

export type DbQuery = {
  table: string
  op: DbOp
  columns?: string
  returning?: string
  payload?: unknown
  options?: unknown
  calls: DbCall[]
}

type Responder = Record<string, DbResult[]> | ((query: DbQuery) => DbResult | undefined)

const CHAIN_METHODS = [
  'eq', 'neq', 'in', 'not', 'is', 'lt', 'lte', 'gt', 'gte', 'or', 'order',
  'limit', 'range', 'match', 'ilike', 'like', 'contains', 'filter', 'throwOnError',
]
const WRITE_METHODS = ['insert', 'update', 'upsert', 'delete'] as const

/**
 * Object responders are keyed by `table.op` and consumed in call order; function responders
 * see the query once its terminal method runs. Unanswered queries resolve to `{ data: null }`.
 */
export function createDbFake(responder: Responder = {}) {
  const queries: DbQuery[] = []
  const queues =
    typeof responder === 'function'
      ? null
      : new Map(Object.entries(responder).map(([key, list]) => [key, [...list]]))

  const respond = (query: DbQuery): DbResult =>
    (typeof responder === 'function'
      ? responder(query)
      : queues?.get(`${query.table}.${query.op}`)?.shift()) ?? {}

  const from = (table: string) => {
    const query: DbQuery = { table, op: 'select', calls: [] }
    queries.push(query)
    const resolve = () => {
      const result = respond(query)
      return Promise.resolve({ data: result.data ?? null, error: result.error ?? null })
    }
    const builder: Record<string, unknown> = {}
    for (const method of CHAIN_METHODS) {
      builder[method] = (...args: unknown[]) => {
        query.calls.push([method, ...args])
        return builder
      }
    }
    builder.select = (columns = '*') => {
      if (query.op === 'select') query.columns = columns
      else query.returning = columns
      query.calls.push(['select', columns])
      return builder
    }
    for (const method of WRITE_METHODS) {
      builder[method] = (payload?: unknown, options?: unknown) => {
        query.op = method
        query.payload = payload
        query.options = options
        query.calls.push([method, payload, options])
        return builder
      }
    }
    builder.single = resolve
    builder.maybeSingle = resolve
    builder.then = (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      resolve().then(onFulfilled, onRejected)
    return builder
  }

  const find = (table: string, op?: DbOp) =>
    queries.filter((query) => query.table === table && (!op || query.op === op))

  return { from, queries, find }
}

export function callsOf(query: DbQuery | undefined, method: string) {
  return (query?.calls || []).filter((call) => call[0] === method).map((call) => call.slice(1))
}

export function eqsOf(query: DbQuery | undefined) {
  return Object.fromEntries(callsOf(query, 'eq').map(([column, value]) => [String(column), value]))
}

export function compact(columns: string | undefined) {
  return String(columns || '').replace(/\s+/g, '')
}

let schemaCache: Map<string, Set<string>> | null = null

function schemaColumns() {
  if (schemaCache) return schemaCache
  const lines = fs.readFileSync(new URL('../lib/database.types.ts', import.meta.url), 'utf8').split('\n')
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
export function unknownColumns(queries: DbQuery[]) {
  const problems: string[] = []
  for (const query of queries) {
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
