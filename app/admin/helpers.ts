import { cn } from '@/lib/utils';

export const statusTone = (value?: string | null) => {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'healthy' || normalized === 'approved' || normalized === 'verified') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (normalized === 'degraded' || normalized === 'pending' || normalized === 'in_progress') return 'bg-amber-100 text-amber-800 border-amber-200';
  if (normalized === 'unhealthy' || normalized === 'rejected' || normalized === 'closed') return 'bg-rose-100 text-rose-800 border-rose-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
};

export const adminListButtonClass = (selected: boolean) =>
  cn(
    'w-full min-w-0 overflow-hidden rounded-xl border p-4 text-left transition duration-200',
    selected ? 'border-blue-400 bg-blue-50' : 'border-blue-100 bg-white hover:bg-slate-50',
  );

export const textMatch = (value: unknown, query: string) => {
  const normalizedQuery = String(query || '').toLowerCase();
  if (!normalizedQuery) return true;
  return String(value || '').toLowerCase().includes(normalizedQuery);
};
