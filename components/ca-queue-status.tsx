import { Badge } from '@/components/ui/badge'
import { VerifiedAccountName } from '@/components/verification-badge'
import { cn } from '@/lib/utils'

export function CaQueueStatusBadge({
  status,
  reverification,
}: {
  status?: string | null
  reverification?: boolean
}) {
  const normalized = reverification ? 'reverification' : String(status || 'unverified').toLowerCase()
  const styles =
    normalized === 'verified'
      ? 'border-green-200 bg-green-50 text-green-700'
      : normalized === 'rejected'
        ? 'border-red-200 bg-red-50 text-red-700'
        : normalized === 'unverified'
          ? 'border-slate-200 bg-slate-50 text-slate-600'
          : 'border-amber-200 bg-amber-50 text-amber-700'

  const label =
    normalized === 'pending'
      ? 'pending review'
      : normalized === 'reverification'
        ? 'reverification'
        : normalized

  return (
    <Badge variant="outline" className={cn('text-xs', styles)}>
      {label}
    </Badge>
  )
}

export function CaQueueAccountTitle({
  name,
  status,
  badgeNumber,
  className,
  nameClassName,
  size = 'sm',
}: {
  name: string
  status?: string | null
  badgeNumber?: string | null
  className?: string
  nameClassName?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  return (
    <VerifiedAccountName
      name={name || 'Untitled'}
      status={status}
      badgeNumber={badgeNumber}
      size={size}
      className={className}
      nameClassName={nameClassName ?? 'truncate text-sm font-medium text-gram-ink'}
    />
  )
}
