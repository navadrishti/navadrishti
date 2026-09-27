export type FieldKind = 'name' | 'date' | 'address' | 'id'

export function compactId(value: string) {
  return value.replace(/[\s\-/._]/g, '').toUpperCase()
}

function collapseText(value: string) {
  return value.replace(/[.,;:'"()#]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase()
}

const NAME_TITLES = new Set(['MR', 'MRS', 'MS', 'SMT', 'SHRI', 'SHREE', 'DR', 'M/S', 'M/S.', 'MESSRS'])
const ADDRESS_STOP = new Set([
  'THE', 'OF', 'AND', 'NEAR', 'OPP', 'OPPOSITE', 'DIST', 'DISTRICT', 'STATE', 'PIN', 'PINCODE',
  'INDIA', 'FLAT', 'FLOOR', 'NO', 'NO.', 'PLOT', 'VILL', 'VILLAGE', 'PO', 'PS', 'TEHSIL',
])

function nameTokens(value: string) {
  return collapseText(value)
    .split(' ')
    .map((token) => token.replace(/\./g, ''))
    .filter((token) => token.length > 1 && !NAME_TITLES.has(token))
}

function namesMatch(a: string, b: string) {
  const left = nameTokens(a)
  const right = nameTokens(b)
  if (left.length === 0 || right.length === 0) return false
  if (left.join(' ') === right.join(' ')) return true
  const shorter = left.length <= right.length ? left : right
  const longer = left.length <= right.length ? right : left
  return shorter.every((token) =>
    longer.some((other) => other === token || other.startsWith(token) || token.startsWith(other))
  )
}

function parseComparableDate(value: string) {
  const trimmed = value.trim()
  const iso = trimmed.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  const dmy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  const parsed = Date.parse(trimmed)
  if (Number.isNaN(parsed)) return collapseText(trimmed)
  const date = new Date(parsed)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function addressTokens(value: string) {
  return collapseText(value)
    .split(' ')
    .filter((token) => token.length > 1 && !ADDRESS_STOP.has(token))
}

function addressesMatch(a: string, b: string) {
  const left = addressTokens(a)
  const right = addressTokens(b)
  if (left.length === 0 || right.length === 0) return false
  const compactA = compactId(a)
  const compactB = compactId(b)
  if (compactA.includes(compactB) || compactB.includes(compactA)) return true
  const setB = new Set(right)
  const overlap = left.filter((token) => setB.has(token)).length
  const smaller = Math.min(left.length, right.length)
  return smaller > 0 && overlap / smaller >= 0.55
}

export function valuesMatch(kind: FieldKind, a: string, b: string) {
  if (kind === 'name') return namesMatch(a, b)
  if (kind === 'date') return parseComparableDate(a) === parseComparableDate(b)
  if (kind === 'address') return addressesMatch(a, b)
  return compactId(a) === compactId(b)
}
