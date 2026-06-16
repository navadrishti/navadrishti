import type { ReactNode } from 'react'

export function parseStringArray(value?: string[] | string | null): string[] {
  if (!value) return []
  if (Array.isArray(value)) return value.filter(Boolean)
  if (typeof value === 'string' && value.trim() && value !== '[]') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed.filter(Boolean) : []
    } catch {
      return value.split(',').map((item) => item.trim()).filter(Boolean)
    }
  }
  return []
}

export function parseImages(value?: string[] | string | null): string[] {
  return parseStringArray(value as string[] | string | undefined)
}

export function displayValue(value: unknown) {
  if (value === null || value === undefined || value === '') return 'Not set'
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : 'Not set'
  return String(value)
}

export function DetailField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-sm text-gray-500">{label}</p>
      <div className="text-sm font-medium text-slate-800 break-words">{value}</div>
    </div>
  )
}

export function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h3 className="text-sm font-medium text-gray-500">{title}</h3>
      <div className="grid grid-cols-1 gap-x-12 gap-y-6 md:grid-cols-2">{children}</div>
    </section>
  )
}
