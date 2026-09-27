'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Edit, MoreVertical, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ImageCarousel } from '@/components/ui/image-carousel'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { VerifiedAccountName } from '@/components/verification-badge'
import { getGramAvatarFallbackStyle } from '@/lib/gram-avatar'
import { getInitials, getProviderLabel } from './helpers'

type ListingCardProps = {
  id: number
  basePath: '/service-requests' | '/service-offers'
  listingNoun: 'need' | 'capability'
  viewLabel: string
  title: string
  description: string
  images: string[]
  statusLabel: string
  statusClassName: string
  categoryLabel: string
  metaLine: string
  ownerProfileId?: number
  providerName: string
  providerType: string
  verified?: boolean
  isOwner?: boolean
  showDeleteButton?: boolean
  onDelete?: () => void
  isDeleting?: boolean
}

export function ListingCard({
  id,
  basePath,
  listingNoun,
  viewLabel,
  title,
  description,
  images,
  statusLabel,
  statusClassName,
  categoryLabel,
  metaLine,
  ownerProfileId,
  providerName,
  providerType,
  verified,
  isOwner,
  showDeleteButton,
  onDelete,
  isDeleting,
}: ListingCardProps) {
  const router = useRouter()
  const detailHref = `${basePath}/${id}`
  const showOwnerMenu = Boolean(isOwner || (showDeleteButton && onDelete))
  const openDetail = () => router.push(detailHref)

  return (
    <Card className="h-full w-full max-w-[360px] overflow-hidden rounded-md border border-gram-border bg-white shadow-none">
      <CardContent className="flex h-full flex-col p-0">
        <div
          role="link"
          tabIndex={0}
          className="block w-full cursor-pointer text-left"
          onClick={openDetail}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              openDetail()
            }
          }}
          aria-label={`Open ${listingNoun} ${title}`}
        >
          <div className="overflow-hidden bg-[#EEF0ED]">
            <div className="h-40 w-full">
              <ImageCarousel
                images={images}
                alt={title}
                className="h-full w-full"
                autoplay
                autoplayInterval={3500}
                showThumbnails={false}
                showImageCount
                enableKeyboardNav={false}
              />
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-3 pt-2.5">
          <div className="flex min-w-0 items-baseline justify-between gap-2">
            <span
              className={`shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] ${statusClassName}`}
              title={statusLabel}
            >
              {statusLabel}
            </span>
            <span className="min-w-0 truncate text-xs text-gram-muted" title={categoryLabel}>
              {categoryLabel}
            </span>
          </div>

          <div className="min-w-0 space-y-1">
            <h3
              className="min-w-0 cursor-pointer truncate text-[17px] font-semibold leading-snug text-gram-ink"
              title={title}
              onClick={openDetail}
            >
              {title}
            </h3>
            <p className="min-w-0 truncate text-[13px] leading-5 text-gram-muted" title={description}>
              {description}
            </p>
          </div>

          <p className="min-w-0 truncate text-xs text-gram-muted" title={metaLine}>
            {metaLine}
          </p>

          <div className="mt-auto flex min-w-0 items-center gap-2 border-t border-gram-border pt-2">
            <Link
              href={ownerProfileId ? `/profile/${ownerProfileId}` : '#'}
              className="flex min-w-0 flex-1 items-center gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-medium"
                style={getGramAvatarFallbackStyle(providerName)}
              >
                {getInitials(providerName)}
              </div>
              <div className="min-w-0 flex-1">
                <VerifiedAccountName
                  name={providerName}
                  verified={Boolean(verified)}
                  size="sm"
                  nameClassName="text-sm font-medium text-gram-ink"
                />
                <p className="truncate text-xs text-gram-muted">
                  {getProviderLabel(providerType)}
                </p>
              </div>
            </Link>

            <Link
              href={detailHref}
              className="inline-flex shrink-0 items-center rounded-md border border-udaan-blue bg-udaan-blue px-2.5 py-1 text-sm font-medium text-white hover:bg-udaan-blue hover:text-white"
              onClick={(e) => e.stopPropagation()}
            >
              {viewLabel}
            </Link>

            {showOwnerMenu ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-gram-muted hover:bg-transparent hover:text-gram-muted active:bg-transparent focus-visible:bg-transparent focus-visible:ring-0"
                    onClick={(e) => e.stopPropagation()}
                    aria-label={listingNoun === 'need' ? 'Need actions' : 'Capability actions'}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                  {isOwner ? (
                    <DropdownMenuItem asChild>
                      <Link href={`${basePath}/edit/${id}`} className="cursor-pointer">
                        <Edit className="mr-2 h-4 w-4" />
                        Edit
                      </Link>
                    </DropdownMenuItem>
                  ) : null}
                  {showDeleteButton && onDelete ? (
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
        </div>
      </CardContent>
    </Card>
  )
}
