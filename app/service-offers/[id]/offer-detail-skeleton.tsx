import { Header } from '@/components/header'
import { Card, CardContent } from '@/components/ui/card'

export function OfferDetailSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6">
          <div className="h-5 w-44 rounded-md bg-gray-200 animate-pulse"></div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-12">
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="grid w-full grid-cols-3 gap-2">
                  <div className="h-10 rounded-md bg-gray-200 animate-pulse" />
                  <div className="h-10 rounded-md bg-gray-200 animate-pulse" />
                  <div className="h-10 rounded-md bg-gray-200 animate-pulse" />
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="h-6 w-56 rounded-md bg-gray-200 animate-pulse" />
                    <div className="h-4 w-full rounded-md bg-gray-200 animate-pulse" />
                    <div className="h-4 w-11/12 rounded-md bg-gray-200 animate-pulse" />
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="rounded-md border border-slate-200 p-4 space-y-2">
                        <div className="h-3 w-24 rounded-md bg-gray-200 animate-pulse" />
                        <div className="h-5 w-4/5 rounded-md bg-gray-200 animate-pulse" />
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
