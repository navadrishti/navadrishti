import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function CampaignDetailSkeleton() {
  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="grid w-full grid-cols-2 gap-2">
          <Skeleton className="h-10 rounded-md" />
          <Skeleton className="h-10 rounded-md" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-5 w-48 rounded-md" />
          <Skeleton className="h-4 w-full rounded-md" />
          <Skeleton className="h-4 w-11/12 rounded-md" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-md border border-slate-200 p-4 space-y-2">
                <Skeleton className="h-3 w-24 rounded-md" />
                <Skeleton className="h-5 w-4/5 rounded-md" />
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
