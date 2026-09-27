import type { RequestRecord } from './types'

export const formatDate = (value?: string | null) => {
  if (!value) return 'N/A'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'N/A'
  return date.toLocaleDateString('en-IN', { timeZone: 'UTC' })
}

export const formatDateTime = (value?: string | null) => {
  if (!value) return 'N/A'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'N/A'
  return date.toLocaleString('en-IN', { timeZone: 'UTC' })
}

export const getInitials = (name?: string) => {
  if (!name) return ''
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export const getStatusColor = (status: string) => {
  if (!status) return 'border-gram-border bg-gram-page text-gram-muted'
  switch (status.toLowerCase()) {
    case 'accepted': return 'border-[#D5E2DA] bg-[#F1F6F3] text-[#4F6B5C]'
    case 'rejected': return 'border-[#E8D8D8] bg-[#F8F1F1] text-[#8C5555]'
    case 'active': return 'border-[#D9E0E4] bg-[#F0F3F4] text-udaan-blue'
    case 'completed': return 'border-gram-border bg-gram-sage text-gram-ink'
    case 'cancelled': return 'border-gram-border bg-gram-page text-gram-muted'
    default: return 'border-gram-border bg-gram-page text-gram-muted'
  }
}

export function parseRequirements(value?: string | Record<string, unknown> | null): Record<string, unknown> {
  if (!value) return {}
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return {}
  }
}

export function normalizeRequestType(value?: string | null) {
  const text = String(value || '').trim()
  return text || 'Not set'
}

export function isLinkedToProject(requirements: Record<string, unknown>, project?: RequestRecord['project']) {
  return Boolean(
    project?.id ||
    requirements.projectId ||
    requirements.project_id ||
    (requirements.project_context && typeof requirements.project_context === 'object')
  )
}

export function getNeedFlags(requestType: string) {
  const type = requestType.toLowerCase()
  return {
    isFinancialNeed: type.includes('financial'),
    isMaterialNeed: type.includes('material'),
    isSkillServiceNeed: type.includes('skill') || type.includes('service'),
    isInfrastructureNeed: type.includes('infra'),
  }
}

export async function uploadReceiptFile(file: File, token: string) {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch('/api/uploads/receipt', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: formData
  })

  const data = await response.json()
  if (!response.ok || !data?.success) {
    throw new Error(data?.error || 'Failed to upload receipt')
  }

  return data.data?.url as string
}
