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

// Skeleton for product/marketplace cards
function SkeletonCard() {
  return (
    <div className="rounded-lg border p-4 space-y-4">
      <Skeleton className="h-48 w-full rounded-md" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-6 w-1/4" />
      </div>
      <div className="flex justify-between">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-20" />
      </div>
    </div>
  )
}

// Skeleton for service cards
function SkeletonServiceCard() {
  return (
    <div className="rounded-lg border p-6 space-y-4">
      <div className="flex items-start space-x-4">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-2/3" />
      </div>
      <div className="flex items-center space-x-2">
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-6 w-12" />
      </div>
      <div className="flex justify-between">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-16" />
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

export { 
  Skeleton,
  SkeletonCard,
  SkeletonServiceCard,
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
  SkeletonGrid
}
