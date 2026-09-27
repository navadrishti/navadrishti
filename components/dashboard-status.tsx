import Link from 'next/link';
import { cn } from '@/lib/utils';

export const getStatusBadgeClass = (status: string): string => {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'accepted' || normalized === 'completed') return 'border-green-300 bg-green-50 text-green-700';
  if (normalized === 'pending' || normalized === 'pledged' || normalized === 'invited' || normalized === 'pending_acceptance' || normalized === 'awaiting_acceptance' || normalized === 'offered' || normalized === 'assigned') return 'border-amber-300 bg-amber-50 text-amber-700';
  if (normalized === 'in_progress' || normalized === 'active') return 'border-blue-300 bg-blue-50 text-blue-700';
  if (normalized === 'rejected' || normalized === 'cancelled' || normalized === 'closed') return 'border-red-300 bg-red-50 text-red-700';
  if (normalized === 'expired') return 'border-slate-300 bg-slate-100 text-slate-700';
  return 'border-slate-300 bg-white text-slate-700';
};

export function StaticStatusBadge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold pointer-events-none select-none',
        className
      )}
    >
      {children}
    </span>
  );
}

export function NeedDetailLink({
  need,
}: {
  need: { id: number; title: string; request_type?: string };
}) {
  return (
    <Link
      href={`/service-requests/${need.id}`}
      className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 no-underline hover:bg-slate-100 hover:text-slate-700 focus:bg-slate-100 focus:text-slate-700"
    >
      {need.title}
      {need.request_type ? ` · ${need.request_type}` : ''}
    </Link>
  );
}
