import { cn } from '@/lib/utils';
import type { SupportTicket, TicketBucket, TicketStatus } from './types';

export const statusTone = (status: TicketStatus) => {
  if (status === 'open') return 'border-udaan-blue/30 bg-udaan-blue/10 text-udaan-blue';
  if (status === 'in_progress') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (status === 'resolved') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  return 'border-slate-200 bg-slate-100 text-slate-700';
};

export const isClosedStatus = (status: TicketStatus) => status === 'resolved' || status === 'closed';

export const tabButtonClass = (active: boolean) =>
  cn(
    'rounded-md border px-4 py-2 text-sm font-medium',
    active
      ? 'border-udaan-blue bg-udaan-blue text-white'
      : 'border-slate-200 bg-white text-slate-700'
  );

export const filterButtonClass = (active: boolean) =>
  cn(
    'inline-flex h-10 w-full items-center justify-center whitespace-nowrap rounded-md border px-2 text-sm font-medium',
    active
      ? 'border-udaan-blue bg-udaan-blue text-white'
      : 'border-slate-200 bg-white text-slate-700'
  );

export function filterTickets(
  tickets: SupportTicket[],
  bucket: TicketBucket,
  statusFilter: TicketStatus | 'all',
  rawQuery: string
) {
  const query = rawQuery.trim().toLowerCase();
  return tickets.filter((ticket) => {
    const bucketPass =
      bucket === 'all'
        ? true
        : bucket === 'open'
          ? !isClosedStatus(ticket.status)
          : isClosedStatus(ticket.status);
    if (!bucketPass) return false;

    const statusPass = statusFilter === 'all' || ticket.status === statusFilter;
    if (!statusPass) return false;
    if (!query) return true;
    return (
      String(ticket.title || '').toLowerCase().includes(query)
      || String(ticket.description || '').toLowerCase().includes(query)
      || String(ticket.ticket_id || '').toLowerCase().includes(query)
    );
  });
}
