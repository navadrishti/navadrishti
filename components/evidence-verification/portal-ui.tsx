import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export function EvidencePortalShell({ children }: { children: ReactNode }) {
  return <div className="flex w-full flex-1 flex-col">{children}</div>;
}

export function EvidencePortalMain({
  children,
  className,
  narrow,
}: {
  children: ReactNode;
  className?: string;
  narrow?: boolean;
}) {
  return (
    <main
      className={cn(
        'udaan-container w-full space-y-6 py-8',
        narrow && 'max-w-4xl',
        className
      )}
    >
      {children}
    </main>
  );
}

export function EvidencePageHeader({
  title,
  description,
  scopeLabels,
  action,
  bordered = true,
}: {
  title: string;
  description: string;
  scopeLabels?: string;
  action?: ReactNode;
  bordered?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between',
        bordered && 'border-b border-slate-200/80 pb-6'
      )}
    >
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
        {scopeLabels ? <p className="text-sm text-slate-600">{scopeLabels}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function EvidenceMessageCard({ children }: { children: ReactNode }) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="py-4 text-sm text-slate-700">{children}</CardContent>
    </Card>
  );
}

export function EvidenceSectionCard({
  title,
  description,
  headerExtra,
  children,
  className,
}: {
  title: string;
  description?: string;
  headerExtra?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('border-slate-200 shadow-sm', className)}>
      <CardHeader className={cn('space-y-3', headerExtra ? 'pb-4' : undefined)}>
        <div>
          <CardTitle className="text-xl">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {headerExtra}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function EvidenceStatCard({
  title,
  description,
  value,
  subtitle,
  action,
}: {
  title: string;
  description: string;
  value: ReactNode;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <Card className="flex h-full flex-col border-slate-200 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-4 pt-0">
        <div className="space-y-1">
          <p className="text-3xl font-semibold tabular-nums text-slate-900">{value}</p>
          <p className="text-sm text-slate-600">{subtitle}</p>
        </div>
        {action ? <div className="pt-1">{action}</div> : null}
      </CardContent>
    </Card>
  );
}

export function EvidenceQueueItem({
  title,
  subtitle,
  badge,
  meta,
  footer,
}: {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  meta?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-semibold text-slate-900">{title}</p>
          {subtitle ? <p className="text-sm text-slate-500">{subtitle}</p> : null}
        </div>
        {badge ? <div className="shrink-0 self-start">{badge}</div> : null}
      </div>
      {meta ? <div className="mt-3">{meta}</div> : null}
      {footer ? (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <EvidenceActionRow>{footer}</EvidenceActionRow>
        </div>
      ) : null}
    </div>
  );
}

export function EvidenceMetaGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-2 text-sm text-slate-600 sm:grid-cols-2 lg:grid-cols-3">
      {children}
    </div>
  );
}

export function EvidenceActionRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end',
        '[&>button]:h-10 [&>button]:w-full [&>button]:sm:w-auto [&>button]:sm:min-w-[9.5rem]',
        className
      )}
    >
      {children}
    </div>
  );
}

export function EvidenceFilterBar({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        {label ? <span className="mr-1 text-sm font-medium text-slate-600">{label}</span> : null}
        {children}
      </div>
    </div>
  );
}

export function EvidenceDetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1 rounded-lg border border-slate-100 bg-slate-50/80 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <div className="text-sm font-medium text-slate-900">{children}</div>
    </div>
  );
}

export function EvidencePortalContentSkeleton() {
  return (
    <>
      <div className="space-y-2 border-b border-slate-200/80 pb-6">
        <div className="h-9 w-64 max-w-full animate-pulse rounded bg-slate-200" />
        <div className="h-5 w-80 max-w-full animate-pulse rounded bg-slate-100" />
        <div className="h-4 w-56 max-w-full animate-pulse rounded bg-slate-100" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={`stat-${index}`} className="flex h-full flex-col rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div className="h-5 w-32 animate-pulse rounded bg-slate-200" />
            <div className="mt-3 h-4 w-48 max-w-full animate-pulse rounded bg-slate-100" />
            <div className="mt-4 h-10 w-16 animate-pulse rounded bg-slate-200" />
            <div className="mt-3 h-4 w-36 animate-pulse rounded bg-slate-100" />
            <div className="mt-auto pt-4">
              <div className="h-10 w-full max-w-[9.5rem] animate-pulse rounded bg-slate-200" />
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={`queue-${index}`} className="flex h-full flex-col rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div className="h-5 w-48 max-w-full animate-pulse rounded bg-slate-200" />
            <div className="mt-3 h-4 w-full max-w-md animate-pulse rounded bg-slate-100" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 2 }).map((_, itemIndex) => (
                <div key={`queue-item-${index}-${itemIndex}`} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="h-4 w-40 max-w-full animate-pulse rounded bg-slate-200" />
                      <div className="h-3 w-28 animate-pulse rounded bg-slate-100" />
                    </div>
                    <div className="h-6 w-24 shrink-0 animate-pulse rounded-full bg-slate-100" />
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
                    <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
                  </div>
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <div className="h-10 w-full animate-pulse rounded bg-slate-200 sm:ml-auto sm:w-36" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function AdminPortalShell({ children }: { children: ReactNode }) {
  return <div className="flex min-h-0 w-full flex-1 flex-col">{children}</div>;
}

export function AdminPortalMain({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('udaan-container flex min-h-0 w-full flex-1 flex-col overflow-hidden px-4 py-6 sm:px-6', className)}>
      {children}
    </div>
  );
}

export function formatAdminDetailValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleString('en-IN');
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? '—' : JSON.stringify(value, null, 2);
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

export function AdminDetailField({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-1 rounded-lg border border-slate-100 bg-slate-50/80 p-3', className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <div className="whitespace-pre-wrap break-words text-sm font-medium text-slate-900">{children}</div>
    </div>
  );
}

export function AdminDetailGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-1 gap-2 sm:grid-cols-2', className)}>{children}</div>;
}

export function AdminDetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3 rounded-lg border border-blue-100 bg-slate-50/60 p-4">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {children}
    </div>
  );
}

export type AdminDetailItem = { label: string; value: ReactNode };

export function AdminDetailItems({ items }: { items: AdminDetailItem[] }) {
  return (
    <AdminDetailGrid>
      {items.map((item) => (
        <AdminDetailField key={item.label} label={item.label}>
          {item.value}
        </AdminDetailField>
      ))}
    </AdminDetailGrid>
  );
}

export function safeParseRecordJson(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

const ADMIN_NAV_ITEM_COUNT = 11;

function AdminCardTitleSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn('h-7 w-44 max-w-full rounded-md bg-slate-200', className)} />;
}

function AdminStatBoxSkeleton() {
  return (
    <div className="rounded-lg border border-blue-100 bg-slate-50 p-3">
      <Skeleton className="h-3 w-16 rounded bg-slate-200" />
      <Skeleton className="mt-2 h-8 w-12 rounded bg-slate-200" />
    </div>
  );
}

function AdminSummaryRowSkeleton() {
  return (
    <div className="flex h-12 items-center justify-between rounded-lg border border-blue-100 bg-slate-50 px-3">
      <Skeleton className="h-4 w-28 rounded bg-slate-200" />
      <Skeleton className="h-6 w-14 rounded-full bg-slate-200" />
    </div>
  );
}

export function AdminSidebarSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('hidden lg:block lg:col-span-3 lg:sticky lg:top-6', className)}>
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardContent className="space-y-3 pt-6">
          {Array.from({ length: ADMIN_NAV_ITEM_COUNT }).map((_, index) => (
            <Skeleton key={`admin-nav-${index}`} className="h-10 w-full rounded-md bg-slate-200/80" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export function AdminListItemSkeleton() {
  return (
    <div className="w-full rounded-xl border border-blue-100 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-[min(100%,14rem)] rounded bg-slate-200" />
          <Skeleton className="h-3 w-[min(100%,10rem)] rounded bg-slate-100" />
        </div>
        <Skeleton className="h-6 w-16 shrink-0 rounded-full bg-slate-200" />
      </div>
      <Skeleton className="mt-2 h-4 w-full rounded bg-slate-100" />
      <Skeleton className="mt-1.5 h-4 w-[85%] rounded bg-slate-100" />
    </div>
  );
}

function AdminInboxPanelSkeleton({
  titleWidth = 'w-36',
  mode = 'support',
}: {
  titleWidth?: string;
  mode?: 'support' | 'refunds';
}) {
  return (
    <Card className="flex min-h-[36rem] flex-col border-blue-100 bg-white shadow-sm">
      <CardHeader className="space-y-0 border-b border-slate-100 p-6 pb-4">
        <AdminCardTitleSkeleton className={titleWidth} />
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4 p-6 pt-6">
        <Skeleton className="h-10 w-full rounded-md bg-slate-200" />
        {mode === 'refunds' ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={`refund-filter-${index}`} className="h-10 w-full rounded-md bg-slate-200" />
              ))}
            </div>
            <Skeleton className="h-10 w-full rounded-md bg-slate-200" />
          </>
        ) : (
          <>
            <div className="space-y-2">
              <Skeleton className="h-3 w-24 rounded bg-slate-200" />
              <div className="grid grid-cols-2 gap-2">
                <Skeleton className="h-10 w-full rounded-md bg-slate-200" />
                <Skeleton className="h-10 w-full rounded-md bg-slate-200" />
              </div>
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-16 rounded bg-slate-200" />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={`filter-${index}`} className="h-10 w-full rounded-md bg-slate-200" />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Skeleton className="h-10 w-full rounded-md bg-slate-200" />
              <Skeleton className="h-10 w-full rounded-md bg-slate-200" />
            </div>
          </>
        )}
        <div className="flex min-h-[14rem] flex-1 flex-col gap-3 border-t border-slate-100 pt-4">
          <div className="max-h-[28rem] space-y-3 overflow-hidden">
            {Array.from({ length: 4 }).map((_, index) => (
              <AdminListItemSkeleton key={`list-${index}`} />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AdminDetailFieldSkeleton() {
  return (
    <div className="min-h-[3.75rem] space-y-2 rounded-lg border border-slate-100 bg-slate-50/80 p-3">
      <Skeleton className="h-3 w-20 rounded bg-slate-200" />
      <Skeleton className="h-4 w-full rounded bg-slate-200" />
    </div>
  );
}

export function AdminDetailPanelSkeleton({ withEditor = true }: { withEditor?: boolean }) {
  return (
    <Card className="flex min-h-[36rem] flex-col border-blue-100 bg-white shadow-sm">
      <CardHeader className="space-y-0 border-b border-slate-100 p-6 pb-4">
        <AdminCardTitleSkeleton className="w-40" />
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4 p-6 pt-6">
        {withEditor ? (
          <>
            <div className="space-y-3 rounded-lg border border-blue-100 bg-slate-50/60 p-4">
              <Skeleton className="h-4 w-36 rounded bg-slate-200" />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {Array.from({ length: 8 }).map((_, index) => (
                  <AdminDetailFieldSkeleton key={`detail-${index}`} />
                ))}
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Skeleton className="h-10 w-full rounded-md bg-slate-200" />
              <Skeleton className="h-10 w-full rounded-md bg-slate-200" />
              <Skeleton className="h-10 w-full rounded-md bg-slate-200 md:col-span-2" />
            </div>
            <Skeleton className="min-h-[7.5rem] w-full rounded-md bg-slate-100" />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Skeleton className="h-10 w-full rounded-md bg-slate-200" />
              <Skeleton className="h-10 w-full rounded-md bg-slate-200" />
              <Skeleton className="h-10 w-full rounded-md bg-slate-200" />
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-6">
            <div className="w-full max-w-sm space-y-2 text-center">
              <Skeleton className="mx-auto h-4 w-48 rounded bg-slate-200" />
              <Skeleton className="mx-auto h-3 w-full rounded bg-slate-100" />
              <Skeleton className="mx-auto h-3 w-[90%] rounded bg-slate-100" />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AdminSplitViewSkeleton({
  inboxTitleWidth,
  detailWithEditor = true,
  inboxMode = 'support',
  columns = 'equal',
}: {
  inboxTitleWidth?: string;
  detailWithEditor?: boolean;
  inboxMode?: 'support' | 'refunds';
  columns?: 'equal' | 'editor';
}) {
  return (
    <div
      className={cn(
        'grid min-h-0 gap-6 overflow-x-hidden xl:items-stretch',
        columns === 'equal' ? 'xl:grid-cols-2' : 'xl:grid-cols-[0.9fr_1.1fr]'
      )}
    >
      <AdminInboxPanelSkeleton titleWidth={inboxTitleWidth} mode={inboxMode} />
      <AdminDetailPanelSkeleton withEditor={detailWithEditor} />
    </div>
  );
}

function AdminOverviewSkeleton() {
  return (
    <div className="mt-0 h-full min-h-0 space-y-6 overflow-y-auto pr-1">
      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="min-w-0 border-blue-100 bg-white shadow-sm">
          <CardHeader className="p-6">
            <AdminCardTitleSkeleton className="w-40" />
          </CardHeader>
          <CardContent className="space-y-3 p-6 pt-0">
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <AdminStatBoxSkeleton key={`stat-${index}`} />
              ))}
            </div>
            {Array.from({ length: 4 }).map((_, index) => (
              <AdminSummaryRowSkeleton key={`summary-${index}`} />
            ))}
          </CardContent>
        </Card>
        <Card className="min-w-0 border-blue-100 bg-white shadow-sm">
          <CardHeader className="p-6">
            <AdminCardTitleSkeleton className="w-56" />
          </CardHeader>
          <CardContent className="space-y-4 p-6 pt-0">
            <div className="space-y-2">
              <Skeleton className="mb-2 h-4 w-28 rounded bg-slate-200" />
              {Array.from({ length: 3 }).map((_, index) => (
                <AdminSummaryRowSkeleton key={`health-${index}`} />
              ))}
            </div>
            <div className="border-t border-blue-100 pt-4">
              <Skeleton className="mb-2 h-4 w-32 rounded bg-slate-200" />
              <div className="max-h-[200px] space-y-2 overflow-hidden">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={`activity-${index}`} className="rounded-lg border border-blue-100 bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-2">
                        <Skeleton className="h-3 w-32 rounded bg-slate-200" />
                        <Skeleton className="h-3 w-full rounded bg-slate-100" />
                      </div>
                      <Skeleton className="h-3 w-16 shrink-0 rounded bg-slate-100" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AdminManagementPanelSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
      <Card className="border-blue-100 bg-white shadow-sm">
        <CardHeader className="p-6">
          <AdminCardTitleSkeleton className="w-56" />
        </CardHeader>
        <CardContent className="space-y-4 p-6 pt-0">
          <Skeleton className="h-10 w-full rounded-md bg-slate-200" />
          <Skeleton className="h-10 w-full rounded-md bg-slate-200" />
          <Skeleton className="h-10 w-full rounded-md bg-slate-200" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-10 w-full rounded-md bg-slate-200" />
            <Skeleton className="h-10 w-full rounded-md bg-slate-200" />
          </div>
          <Skeleton className="h-10 w-full rounded-md bg-slate-200" />
        </CardContent>
      </Card>
      <Card className="min-h-[420px] border-blue-100 bg-white shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-6">
          <AdminCardTitleSkeleton className="w-40" />
          <Skeleton className="h-9 w-24 rounded-md bg-slate-200" />
        </CardHeader>
        <CardContent className="space-y-3 p-6 pt-0">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={`mgmt-row-${index}`} className="h-28 w-full rounded-lg bg-slate-100" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function renderAdminTabSkeleton(activeTab: string) {
  switch (activeTab) {
    case 'overview':
      return <AdminOverviewSkeleton />;
    case 'support':
      return (
        <AdminSplitViewSkeleton
          inboxTitleWidth="w-36"
          detailWithEditor={false}
          inboxMode="support"
          columns="equal"
        />
      );
    case 'refunds':
      return (
        <AdminSplitViewSkeleton
          inboxTitleWidth="w-44"
          detailWithEditor={false}
          inboxMode="refunds"
          columns="equal"
        />
      );
    case 'government-admins':
    case 'ca-credentials':
      return <AdminManagementPanelSkeleton />;
    default:
      return (
        <AdminSplitViewSkeleton
          inboxTitleWidth="w-36"
          detailWithEditor
          inboxMode="support"
          columns="editor"
        />
      );
  }
}

export function AdminConsoleSkeleton({ activeTab = 'overview' }: { activeTab?: string }) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 items-start gap-6 overflow-hidden lg:grid-cols-12">
      <AdminSidebarSkeleton />
      <Card className="h-full min-h-0 overflow-hidden border-slate-200 bg-white text-slate-900 shadow-sm lg:col-span-9">
        <CardContent className="h-full min-h-0 overflow-y-auto pt-6 pr-4 lg:overflow-y-auto">
          {renderAdminTabSkeleton(activeTab)}
        </CardContent>
      </Card>
    </div>
  );
}

export function AdminTicketDetailSkeleton() {
  return (
    <div className="flex-1 space-y-5 overflow-y-auto pr-1">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-3 w-16 rounded bg-slate-200" />
          <Skeleton className="h-7 w-40 rounded bg-slate-200" />
        </div>
        <Skeleton className="h-6 w-20 rounded-full bg-slate-200" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={`meta-${index}`} className="space-y-2">
            <Skeleton className="h-3 w-16 rounded bg-slate-200" />
            <Skeleton className="h-4 w-32 rounded bg-slate-200" />
            <Skeleton className="h-3 w-40 rounded bg-slate-100" />
          </div>
        ))}
      </div>
      <div className="space-y-3 rounded-lg border border-blue-100 bg-slate-50/60 p-4">
        <Skeleton className="h-4 w-36 rounded bg-slate-200" />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <AdminDetailFieldSkeleton key={`ticket-detail-${index}`} />
          ))}
        </div>
      </div>
      <AdminMessagesSkeleton />
    </div>
  );
}

export function AdminMessagesSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-20 rounded bg-slate-200" />
      <div className="space-y-3 rounded-lg border bg-slate-50 p-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={`message-${index}`} className="min-h-[4.5rem] space-y-2 rounded-lg border bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-3 w-16 rounded bg-slate-200" />
              <Skeleton className="h-3 w-24 rounded bg-slate-200" />
            </div>
            <Skeleton className="h-4 w-full rounded bg-slate-100" />
            <Skeleton className="h-4 w-[80%] rounded bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
