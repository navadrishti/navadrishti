import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

// Skeleton for generic card layouts
function SkeletonCard() {
  return (
    <div className="rounded-md border-2 border-slate-200 p-3 space-y-3 bg-white">
      <Skeleton className="h-44 w-full rounded-md" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-3/4 rounded-md" />
        <Skeleton className="h-4 w-1/2 rounded-md" />
        <Skeleton className="h-6 w-1/4 rounded-md" />
      </div>
      <div className="flex justify-between">
        <Skeleton className="h-8 w-16 rounded-md" />
        <Skeleton className="h-8 w-20 rounded-md" />
      </div>
    </div>
  )
}

// Skeleton for service cards
function SkeletonServiceCard() {
  return (
    <div className="w-[320px] h-[480px] bg-white rounded-md border-2 border-slate-200 p-0 flex flex-col shadow-sm overflow-hidden">
      {/* Top project bar - simplified */}
      <div className="flex items-center justify-between px-2 py-2 border-b border-slate-200">
        <div className="px-2">
          <p className="sr-only">Project</p>
          <Skeleton className="h-4 w-36 rounded-md" />
        </div>
        <Skeleton className="h-6 w-16 rounded-md" />
      </div>

      {/* Image area */}
      <div className="w-full">
        <Skeleton className="h-[180px] w-full" />
      </div>

      {/* Content area */}
      <div className="p-3 flex-1 flex flex-col">
        <div className="space-y-2">
          <Skeleton className="h-5 w-3/4 rounded-md" />
          <Skeleton className="h-3 w-full rounded-md" />
          <Skeleton className="h-3 w-4/5 rounded-md" />
        </div>

        <div className="mt-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-7 w-7 rounded-md" />
            <div className="space-y-1">
              <Skeleton className="h-4 w-28 rounded-md" />
              <Skeleton className="h-3 w-20 rounded-md" />
            </div>
          </div>

          <div className="flex gap-2">
            <Skeleton className="h-8 w-20 rounded-md" />
            <Skeleton className="h-8 w-20 rounded-md" />
          </div>
        </div>
      </div>
    </div>
  )
}

// Skeleton that matches the simplified Service Offer card layout
function SkeletonServiceOffer() {
  return (
    <div className="h-full w-full max-w-[360px] overflow-hidden rounded-md border-2 border-slate-200 bg-white p-0 shadow-none">
      <div className="flex h-full flex-col p-2">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-28 rounded-full" />
        </div>

        <div className="mt-2 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
          <Skeleton className="h-32 w-full rounded-md" />
        </div>

        <div className="mt-2 min-w-0 space-y-1 border-t border-slate-200 pt-2">
          <Skeleton className="h-5 w-3/4 rounded" />
          <Skeleton className="h-3 w-full rounded" />
        </div>

        <div className="mt-2 grid grid-cols-3 gap-2 border-t border-slate-200 pt-2">
          <div className="min-w-0 space-y-1">
            <Skeleton className="h-3 w-10 rounded" />
            <Skeleton className="h-4 w-full rounded" />
          </div>
          <div className="min-w-0 space-y-1">
            <Skeleton className="h-3 w-12 rounded" />
            <Skeleton className="h-4 w-full rounded" />
          </div>
          <div className="min-w-0 space-y-1">
            <Skeleton className="h-3 w-12 rounded" />
            <Skeleton className="h-4 w-full rounded" />
          </div>
        </div>

        <div className="mt-1 border-t border-slate-200 pt-1">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 px-1 py-0.5">
              <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1">
                <Skeleton className="h-3.5 w-32 rounded" />
                <Skeleton className="h-3 w-20 rounded" />
              </div>
            </div>
            <Skeleton className="h-8 w-px shrink-0 rounded-none" />
            <Skeleton className="h-4 w-24 shrink-0 rounded" />
          </div>
        </div>
      </div>
    </div>
  )
}

// Skeleton for profile cards
function SkeletonProfileCard() {
  return (
    <div className="rounded-lg border p-6 space-y-4">
      <div className="flex items-center space-x-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
      </div>
      <div className="flex space-x-2">
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-6 w-14" />
      </div>
    </div>
  )
}

// Skeleton for order/transaction items
function SkeletonOrderItem() {
  return (
    <div className="flex items-center space-x-4 p-4 border rounded-lg">
      <Skeleton className="h-16 w-16 rounded-md shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <div className="flex space-x-2">
          <Skeleton className="h-6 w-12" />
          <Skeleton className="h-6 w-16" />
        </div>
      </div>
      <div className="text-right space-y-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-3 w-12" />
      </div>
    </div>
  )
}

// Skeleton for list items (like skills, addresses)
function SkeletonListItem() {
  return (
    <div className="flex items-center justify-between p-3 border rounded-lg">
      <div className="flex items-center space-x-3">
        <Skeleton className="h-8 w-8 rounded-full" />
        <div className="space-y-1">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <div className="flex space-x-2">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-12" />
      </div>
    </div>
  )
}

// Skeleton for table rows
function SkeletonTableRow() {
  return (
    <div className="flex items-center space-x-4 p-4 border-b">
      <Skeleton className="h-4 w-1/6" />
      <Skeleton className="h-4 w-1/4" />
      <Skeleton className="h-4 w-1/5" />
      <Skeleton className="h-4 w-1/6" />
      <Skeleton className="h-8 w-20" />
    </div>
  )
}

// Skeleton for form fields
function SkeletonForm() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-24 w-full" />
      </div>
      <div className="flex space-x-4">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-20" />
      </div>
    </div>
  )
}

// Flexible skeleton patterns for different content types

// Avatar + Text Lines (like your example)
function SkeletonAvatarText() {
  return (
    <div className="flex flex-row gap-2">
      <Skeleton className="w-12 h-12 rounded-full" />
      <div className="flex flex-col gap-2">
        <Skeleton className="w-28 h-5 rounded-full" />
        <Skeleton className="w-36 h-5 rounded-full" />
      </div>
    </div>
  )
}

// Small Avatar + Single Text Line
function SkeletonAvatarSingle() {
  return (
    <div className="flex items-center gap-3">
      <Skeleton className="w-8 h-8 rounded-full" />
      <Skeleton className="w-24 h-4 rounded-full" />
    </div>
  )
}

// Text Lines Only (various lengths)
function SkeletonTextLines({ lines = 3 }: { lines?: number }) {
  const widths = ['w-full', 'w-5/6', 'w-3/4', 'w-2/3', 'w-1/2']
  
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton 
          key={i} 
          className={`h-4 ${widths[i % widths.length]} rounded-full`} 
        />
      ))}
    </div>
  )
}

// Image + Text Block
function SkeletonImageText() {
  return (
    <div className="flex gap-4">
      <Skeleton className="w-16 h-16 rounded-md shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4 rounded-full" />
        <Skeleton className="h-3 w-1/2 rounded-full" />
        <Skeleton className="h-3 w-2/3 rounded-full" />
      </div>
    </div>
  )
}

// Big Content Box
function SkeletonBigBox() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-48 w-full rounded-lg" />
      <div className="space-y-2">
        <Skeleton className="h-6 w-3/4 rounded-full" />
        <Skeleton className="h-4 w-full rounded-full" />
        <Skeleton className="h-4 w-5/6 rounded-full" />
      </div>
    </div>
  )
}

// Button Skeleton
function SkeletonButton({ size = 'default' }: { size?: 'sm' | 'default' | 'lg' }) {
  const sizeClasses = {
    sm: 'h-8 w-16',
    default: 'h-10 w-20',
    lg: 'h-12 w-24'
  }
  
  return <Skeleton className={`${sizeClasses[size]} rounded-md`} />
}

// Header/Title Skeleton
function SkeletonHeader() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-8 w-1/3 rounded-full" />
      <Skeleton className="h-4 w-1/2 rounded-full" />
    </div>
  )
}

// Stats/Numbers Skeleton
function SkeletonStats() {
  return (
    <div className="flex gap-6">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="text-center space-y-2">
          <Skeleton className="h-8 w-16 rounded-full mx-auto" />
          <Skeleton className="h-3 w-12 rounded-full mx-auto" />
        </div>
      ))}
    </div>
  )
}

// Card Grid Skeleton
function SkeletonGrid({ items = 4 }: { items?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: items }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}

// CTA Skeleton
function SkeletonCTA() {
  return (
    <div className="mb-8 p-8 bg-white rounded-md border-2 border-black shadow-sm relative overflow-hidden">
      <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
        <div className="text-center md:text-left">
          <Skeleton className="h-8 w-72 mb-3" />
          <Skeleton className="h-5 w-full max-w-md" />
        </div>
        <Skeleton className="h-[58px] w-[210px] rounded-lg" />
      </div>
    </div>
  )
}

export { 
  Skeleton,
  SkeletonCard,
  SkeletonServiceCard,
  SkeletonServiceOffer,
  SkeletonProfileCard,
  SkeletonOrderItem,
  SkeletonListItem,
  SkeletonTableRow,
  SkeletonForm,
  // New flexible patterns
  SkeletonAvatarText,
  SkeletonAvatarSingle,
  SkeletonTextLines,
  SkeletonImageText,
  SkeletonBigBox,
  SkeletonButton,
  SkeletonHeader,
  SkeletonStats,
  SkeletonGrid,
  SkeletonCTA
}
