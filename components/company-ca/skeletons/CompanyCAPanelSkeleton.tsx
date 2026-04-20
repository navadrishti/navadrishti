export default function CompanyCAPanelSkeleton() {
  return (
    <div className="min-h-screen bg-slate-100">
      
      {/* Header */}
      <div className="border-b bg-white">
        <div className="mx-auto max-w-6xl px-6 py-5">
          <div className="h-8 w-56 bg-slate-200 rounded animate-pulse" />
          <div className="mt-2 h-4 w-80 bg-slate-100 rounded animate-pulse" />
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 pt-6 pb-10 space-y-6">

        {/* Toggle */}
        <div className="flex justify-between">
          <div className="h-6 w-40 bg-slate-200 rounded animate-pulse"></div>
          <div className="h-6 w-32 bg-slate-200 rounded animate-pulse"></div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border bg-white p-6 space-y-3">
            <div className="h-5 w-32 bg-slate-200 rounded animate-pulse"></div>
            <div className="h-4 w-40 bg-slate-100 rounded animate-pulse"></div>
            <div className="h-10 w-20 bg-slate-200 rounded animate-pulse"></div>
          </div>

          <div className="rounded-xl border bg-white p-6 space-y-3">
            <div className="h-5 w-32 bg-slate-200 rounded animate-pulse"></div>
            <div className="h-4 w-40 bg-slate-100 rounded animate-pulse"></div>
            <div className="h-10 w-20 bg-slate-200 rounded animate-pulse"></div>
            <div className="h-10 w-full bg-slate-200 rounded animate-pulse"></div>
          </div>
        </div>

        {/* Payment */}
        <div className="rounded-xl border bg-white p-6 space-y-3">
          <div className="h-5 w-40 bg-slate-200 rounded animate-pulse"></div>
          <div className="h-4 w-60 bg-slate-100 rounded animate-pulse"></div>
          <div className="h-20 bg-slate-100 rounded animate-pulse"></div>
        </div>

        {/* Projects */}
        <div className="space-y-4">
          <div className="h-24 bg-slate-100 rounded animate-pulse"></div>
          <div className="h-24 bg-slate-100 rounded animate-pulse"></div>
          <div className="h-24 bg-slate-100 rounded animate-pulse"></div>
        </div>

      </div>
    </div>
  );
}