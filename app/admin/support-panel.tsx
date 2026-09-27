'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { AdminListItemSkeleton } from '@/components/evidence-verification/portal-ui';
import { cn } from '@/lib/utils';
import { SupportStatusTag } from './detail-panels';
import type { SupportPanelState } from './support-state';
import { SupportTicketDetailCard } from './support-ticket-detail';
import type { SupportTicket } from './types';

const supportFilterButtonClass = (active: boolean) =>
  cn(
    'inline-flex h-10 w-full items-center justify-center whitespace-nowrap rounded-md border px-2 text-sm font-medium',
    active
      ? 'border-udaan-blue bg-udaan-blue text-white'
      : 'border-slate-200 bg-white text-slate-700'
  );

export function SupportPanel({ tickets, state }: { tickets: SupportTicket[]; state: SupportPanelState }) {
  const {
    supportLoading,
    supportQuery,
    setSupportQuery,
    supportStatusFilter,
    setSupportStatusFilter,
    supportBucketFilter,
    setSupportBucketFilter,
    selectedTicketDetail,
    fetchTickets,
    selectTicket,
  } = state;

  const visibleTickets = useMemo(() => {
    const query = supportQuery.trim().toLowerCase();
    return tickets.filter((ticket) => {
      const bucketPass =
        supportBucketFilter === 'all'
          ? true
          : supportBucketFilter === 'open'
            ? ['open', 'in_progress'].includes(ticket.status)
            : ['resolved', 'closed'].includes(ticket.status);
      if (!bucketPass) return false;

      const statusPass = supportStatusFilter === 'all' || ticket.status === supportStatusFilter;
      if (!statusPass) return false;
      if (!query) return true;
      return (
        String(ticket.title || '').toLowerCase().includes(query)
        || String(ticket.description || '').toLowerCase().includes(query)
        || String(ticket.ticket_id || '').toLowerCase().includes(query)
        || String(ticket.user_name || ticket.user?.name || '').toLowerCase().includes(query)
        || String(ticket.user_email || ticket.user?.email || '').toLowerCase().includes(query)
      );
    });
  }, [tickets, supportQuery, supportStatusFilter, supportBucketFilter]);

  return (
    <div className="grid min-h-0 gap-6 overflow-x-hidden xl:grid-cols-2 xl:items-stretch">
      <Card className="flex min-h-[36rem] flex-col border-udaan-blue/15 bg-white">
        <CardHeader className="border-b border-slate-100 pb-4">
          <CardTitle className="text-slate-900">
            Ticket Inbox
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4 pt-6">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ticket bucket</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setSupportBucketFilter('open');
                  setSupportStatusFilter('all');
                }}
                className={supportFilterButtonClass(supportBucketFilter === 'open')}
              >
                Open Tickets
              </button>
              <button
                type="button"
                onClick={() => {
                  setSupportBucketFilter('closed');
                  setSupportStatusFilter('all');
                }}
                className={supportFilterButtonClass(supportBucketFilter === 'closed')}
              >
                Closed Tickets
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button
                type="button"
                onClick={() => {
                  setSupportStatusFilter('open');
                  setSupportBucketFilter('open');
                }}
                className={supportFilterButtonClass(supportStatusFilter === 'open')}
              >
                Open
              </button>
              <button
                type="button"
                onClick={() => {
                  setSupportStatusFilter('in_progress');
                  setSupportBucketFilter('open');
                }}
                className={supportFilterButtonClass(supportStatusFilter === 'in_progress')}
              >
                In Progress
              </button>
              <button
                type="button"
                onClick={() => {
                  setSupportStatusFilter('resolved');
                  setSupportBucketFilter('closed');
                }}
                className={supportFilterButtonClass(supportStatusFilter === 'resolved')}
              >
                Resolved
              </button>
              <button
                type="button"
                onClick={() => {
                  setSupportStatusFilter('closed');
                  setSupportBucketFilter('closed');
                }}
                className={supportFilterButtonClass(supportStatusFilter === 'closed')}
              >
                Closed
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full border-slate-200 bg-white text-slate-700"
              onClick={() => {
                setSupportBucketFilter('all');
                setSupportStatusFilter('all');
              }}
            >
              Show all
            </Button>
            <Button
              type="button"
              className="h-10 w-full bg-udaan-blue text-white hover:bg-udaan-blue/90"
              onClick={() => fetchTickets(supportStatusFilter === 'all' ? undefined : supportStatusFilter, supportQuery.trim() || undefined)}
            >
              Refresh
            </Button>
          </div>

          <Input
            value={supportQuery}
            onChange={(e) => setSupportQuery(e.target.value)}
            placeholder="Search title, description, ticket ID, user"
            className="h-10 border-slate-200 bg-white text-slate-900 placeholder:text-slate-400"
          />

          <div className="flex min-h-[14rem] flex-1 flex-col border-t border-slate-100 pt-4">
            {supportLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <AdminListItemSkeleton key={`support-skeleton-${index}`} />
                ))}
              </div>
            ) : visibleTickets.length === 0 ? (
              <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50 py-10 text-center text-sm text-slate-500">
                No tickets found for this filter.
              </div>
            ) : (
              <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
                {visibleTickets.map((ticket) => (
                  <button
                    key={ticket.ticket_id}
                    type="button"
                    onClick={() => selectTicket(ticket)}
                    className={cn(
                      'w-full min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4 text-left outline-none focus-visible:outline-none',
                      selectedTicketDetail?.ticket_id === ticket.ticket_id
                        ? 'border-udaan-blue bg-udaan-blue/[0.04]'
                        : 'border-slate-200'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-gray-900">{ticket.title}</p>
                        <p className="text-xs text-gray-500">
                          {ticket.ticket_id} • {ticket.user_name || ticket.user?.name || 'Unknown user'}
                        </p>
                      </div>
                      <SupportStatusTag status={ticket.status} />
                    </div>
                    <p className="mt-2 line-clamp-2 break-all text-sm text-gray-600">{ticket.description}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <SupportTicketDetailCard state={state} />
    </div>
  );
}
