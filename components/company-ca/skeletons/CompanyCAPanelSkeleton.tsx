import {
  EvidencePortalMain,
  EvidencePortalShell,
} from '@/components/evidence-verification/portal-ui';

export default function CompanyCAPanelSkeleton() {
  return (
    <EvidencePortalShell>
      <div className="border-b bg-udaan-blue">
        <div className="udaan-container flex h-16 items-center px-4 md:px-6">
          <div className="h-10 w-36 rounded bg-white/20 animate-pulse" />
          <div className="ml-auto flex items-center gap-4">
            <div className="h-8 w-24 rounded bg-white/20 animate-pulse" />
            <div className="h-8 w-24 rounded bg-white/20 animate-pulse" />
            <div className="h-9 w-9 rounded-full bg-white/20 animate-pulse" />
          </div>
        </div>
      </div>

      <EvidencePortalMain>
        <div className="space-y-2 border-b border-slate-200/80 pb-6">
          <div className="h-9 w-64 rounded bg-slate-200 animate-pulse" />
          <div className="h-5 w-80 max-w-full rounded bg-slate-100 animate-pulse" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="rounded-lg border border-slate-200 bg-white p-6 space-y-3 shadow-sm">
              <div className="h-5 w-32 bg-slate-200 rounded animate-pulse" />
              <div className="h-4 w-40 bg-slate-100 rounded animate-pulse" />
              <div className="h-10 w-20 bg-slate-200 rounded animate-pulse" />
            </div>
          ))}
        </div>

        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-lg border border-slate-200 bg-white p-6 space-y-3 shadow-sm">
            <div className="h-5 w-48 bg-slate-200 rounded animate-pulse" />
            <div className="h-4 w-full max-w-md bg-slate-100 rounded animate-pulse" />
            <div className="h-24 w-full bg-slate-100 rounded animate-pulse" />
          </div>
        ))}
      </EvidencePortalMain>
    </EvidencePortalShell>
  );
}
