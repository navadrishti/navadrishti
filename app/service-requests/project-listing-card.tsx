'use client'

import Link from 'next/link'
import { MoreVertical, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardTitle } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { VerifiedAccountName } from '@/components/verification-badge'
import { getGramAvatarFallbackStyle } from '@/lib/gram-avatar'
import { formatDisplayDate } from '@/lib/format-date'
import { formatProjectExactAddress } from '@/lib/service-request-allocation'
import type { ProjectListing } from './types'

function getInitials(name?: string) {
  const parts = String(name || 'NGO').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'NG'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
}

function getProjectStatusClass(status?: string) {
  switch (String(status || '').toLowerCase()) {
    case 'active':
    case 'open':
    case 'published':
      return 'text-[#4F6B5C]'
    case 'draft':
    case 'pending':
      return 'text-[#8A6F45]'
    case 'completed':
    case 'closed':
    case 'expired':
      return 'text-gram-muted'
    case 'cancelled':
      return 'text-[#8C5555]'
    default:
      return 'text-udaan-blue'
  }
}

function getDetailFields(project: ProjectListing) {
  const addressLabel =
    project.location_summary ||
    formatProjectExactAddress(project.exact_address || project.location) ||
    project.location ||
    'Not set'
  const validUntil = formatDisplayDate(project.valid_until) || 'Not set'
  const timeline = String(project.timeline || '').trim() || 'Not set'
  const budgetLabel =
    project.budget_inr != null && Number.isFinite(Number(project.budget_inr))
      ? `₹${Number(project.budget_inr).toLocaleString('en-IN')}`
      : 'Not set'
  const beneficiariesLabel =
    project.expected_beneficiaries != null && Number(project.expected_beneficiaries) > 0
      ? Number(project.expected_beneficiaries).toLocaleString('en-IN')
      : 'Not set'
  const volunteersLabel =
    project.volunteers_needed != null && Number(project.volunteers_needed) > 0
      ? String(Number(project.volunteers_needed))
      : 'Not set'

  return [
    { label: 'Address', value: addressLabel },
    { label: 'Validity', value: validUntil },
    { label: 'Timeline', value: timeline },
    { label: 'Beneficiaries', value: beneficiariesLabel },
    { label: 'Budget', value: budgetLabel },
    { label: 'Volunteers', value: volunteersLabel },
  ]
}

export function ProjectListingCard({
  project,
  isOwner,
  isDeleting,
  onDelete,
}: {
  project: ProjectListing
  isOwner: boolean
  isDeleting?: boolean
  onDelete?: () => void
}) {
  const categoryLabel = String(project.category || '').trim() || 'CSR Project'
  const detailFields = getDetailFields(project)

  return (
    <Card className="h-full w-full max-w-[360px] overflow-hidden rounded-md border border-gram-border bg-white shadow-none">
      <CardContent className="flex h-full flex-col gap-2 px-3 pb-3 pt-2.5">
        <div className="flex min-w-0 items-baseline justify-between gap-2">
          <span
            className={`shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] ${getProjectStatusClass(project.status)}`}
            title={String(project.status || 'active')}
          >
            {String(project.status || 'active')}
          </span>
          <span className="min-w-0 truncate text-xs text-gram-muted" title={categoryLabel}>
            {categoryLabel}
          </span>
        </div>

        <div className="min-w-0 space-y-1">
          <Link href={`/service-requests/projects/${project.id}`} className="block min-w-0">
            <CardTitle
              className="cursor-pointer truncate text-[17px] font-semibold leading-snug text-gram-ink"
              title={project.title}
            >
              {project.title}
            </CardTitle>
          </Link>
          <p className="min-w-0 truncate text-[13px] leading-5 text-gram-muted" title={project.description ?? undefined}>
            {project.description}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-gram-border pt-2">
          {detailFields.map((field) => (
            <div
              key={field.label}
              className={`min-w-0 space-y-0.5 ${field.label === 'Address' ? 'col-span-2' : ''}`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-gram-muted">
                {field.label}
              </p>
              <p className="truncate text-[13px] font-medium text-gram-ink" title={field.value}>
                {field.value}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-auto flex min-w-0 items-center gap-2 border-t border-gram-border pt-2">
          <Link
            href={project.ngo_id ? `/profile/${project.ngo_id}` : '#'}
            className="flex min-w-0 flex-1 items-center gap-2"
          >
            <div
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-medium"
              style={getGramAvatarFallbackStyle(project.ngo_name || 'NGO')}
            >
              {getInitials(project.ngo_name)}
            </div>
            <div className="min-w-0 flex-1">
              <VerifiedAccountName
                name={project.ngo_name || 'NGO'}
                verified={Boolean(project.ngo_verified)}
                size="sm"
                nameClassName="text-sm font-medium text-gram-ink"
              />
              <p className="truncate text-xs text-gram-muted">NGO</p>
            </div>
          </Link>

          <Link
            href={`/service-requests/projects/${project.id}`}
            className="inline-flex shrink-0 items-center rounded-md border border-udaan-blue bg-udaan-blue px-2.5 py-1 text-sm font-medium text-white hover:bg-udaan-blue hover:text-white"
          >
            View project
          </Link>

          {isOwner ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-gram-muted hover:bg-transparent hover:text-gram-muted active:bg-transparent focus-visible:bg-transparent focus-visible:ring-0"
                  aria-label="Project actions"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={`/service-requests/projects/${project.id}/edit`} className="cursor-pointer">
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </Link>
                </DropdownMenuItem>
                {onDelete ? (
                  <DropdownMenuItem
                    disabled={isDeleting}
                    className="text-red-700 focus:text-red-700"
                    onSelect={(e) => {
                      e.preventDefault()
                      if (!isDeleting) onDelete()
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {isDeleting ? 'Deleting...' : 'Delete'}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
