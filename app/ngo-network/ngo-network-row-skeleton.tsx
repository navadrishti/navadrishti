import { Skeleton } from "@/components/ui/skeleton"

export function NGONetworkRowSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="relative lg:hidden">
        <Skeleton className="h-20 w-full rounded-none" />
        <Skeleton className="absolute -bottom-8 left-3 h-16 w-16 rounded-md border-2 border-white" />
      </div>
      <div className="p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <Skeleton className="hidden h-20 w-20 shrink-0 rounded-md lg:block" />
          <div className="min-w-0 flex-1 space-y-1.5 pt-9 lg:pt-0">
            <Skeleton className="h-4 w-48 max-w-full rounded" />
            <Skeleton className="h-3 w-32 max-w-full rounded" />
            <Skeleton className="h-3 w-24 rounded" />
          </div>
          <div className="w-full space-y-1.5 lg:w-44">
            <Skeleton className="h-5 w-full rounded-full" />
            <Skeleton className="h-8 w-full rounded-md" />
            <Skeleton className="h-8 w-full rounded-md" />
          </div>
        </div>
      </div>
    </div>
  )
}
