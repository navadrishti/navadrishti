import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const types = fs.readFileSync(path.resolve(import.meta.dirname, '../lib/database.types.ts'), 'utf8')

const TABLES = ['auth_rate_limits', 'auth_one_time_codes']
const FUNCTIONS = [
  'auth_rate_limit_hit',
  'auth_code_issue',
  'auth_code_attempt',
  'auth_code_find',
  'auth_code_consume',
  'auth_throttle_cleanup',
]

describe('auth throttle store types', () => {
  it('are mirrored in lib/database.types.ts', () => {
    for (const table of TABLES) expect(types).toMatch(new RegExp(`^ {6}${table}: \\{$`, 'm'))
    for (const name of FUNCTIONS) expect(types).toMatch(new RegExp(`^ {6}${name}: \\{$`, 'm'))
  })
})
