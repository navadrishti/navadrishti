import { Badge } from '@/components/ui/badge'
import { formatStatusLabel } from '@/lib/format-date'

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  accepted: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  active: 'bg-blue-100 text-blue-800',
  completed: 'bg-gray-100 text-gray-800',
  cancelled: 'bg-gray-100 text-gray-800'
}

const URGENCY_COLORS: Record<string, string> = {
  low: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800'
}

const FALLBACK_COLOR = 'bg-gray-100 text-gray-800'

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge className={STATUS_COLORS[status] || FALLBACK_COLOR}>
      {formatStatusLabel(status)}
    </Badge>
  )
}

export function UrgencyBadge({ urgency }: { urgency: string }) {
  return (
    <Badge className={URGENCY_COLORS[urgency] || FALLBACK_COLOR}>
      {urgency.charAt(0).toUpperCase() + urgency.slice(1)}
    </Badge>
  )
}
