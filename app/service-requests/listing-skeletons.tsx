import { Skeleton, SkeletonCTA, SkeletonServiceCard, SkeletonServiceProject, PlatformContentSkeleton, PlatformPageSkeleton } from '@/components/ui/skeleton'
import type { ListingKind } from './types'

export function ServiceRequestCardSkeleton({ kind = 'needs' }: { kind?: ListingKind }) {
  if (kind === 'projects') return <SkeletonServiceProject />
  return <SkeletonServiceCard />
}

export function ServiceRequestsPageSkeleton() {
  return (
    <PlatformPageSkeleton>
      <PlatformContentSkeleton>
        <div className="mb-8 flex flex-col gap-3">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-5 w-full max-w-xl" />
        </div>

        <SkeletonCTA />

        <div className="mb-8">
          <div className="mb-6 grid gap-6 md:grid-cols-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <ServiceRequestCardSkeleton key={i} kind="needs" />
            ))}
          </div>
        </div>
      </PlatformContentSkeleton>
    </PlatformPageSkeleton>
  )
}
