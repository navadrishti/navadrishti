'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatStatusLabel } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import { statusTone } from './helpers';
import type { SupportTicket } from './types';

export function TicketList({
  tickets,
  loading,
  selectedTicketId,
  onSelect,
  onRaiseTicket,
}: {
  tickets: SupportTicket[];
  loading: boolean;
  selectedTicketId: string | null;
  onSelect: (ticket: SupportTicket) => void;
  onRaiseTicket: () => void;
}) {
  if (loading) {
    return (
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardContent className="py-10 text-center text-slate-500">Loading tickets...</CardContent>
      </Card>
    );
  }

  if (tickets.length === 0) {
    return (
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardContent className="py-10 text-center text-slate-500">
          No tickets found for this filter.
          <div className="mt-3">
            <Button
              size="sm"
              onClick={onRaiseTicket}
              className="bg-udaan-blue text-white hover:bg-udaan-blue/90"
            >
              Raise a ticket
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {tickets.map((ticket) => (
        <Card
          key={ticket.ticket_id}
          className={cn(
            'cursor-pointer border border-slate-200 bg-white shadow-sm outline-none',
            selectedTicketId === ticket.ticket_id
              ? 'border-udaan-blue bg-udaan-blue/[0.04]'
              : 'border-slate-200'
          )}
          onClick={() => onSelect(ticket)}
        >
          <CardContent className="space-y-2 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">{ticket.title}</p>
                <p className="text-xs text-slate-500">{ticket.ticket_id}</p>
              </div>
              <span className={cn('shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold', statusTone(ticket.status))}>
                {formatStatusLabel(ticket.status)}
              </span>
            </div>
            <p className="line-clamp-2 text-sm text-slate-600">{ticket.description}</p>
            <p className="text-xs text-slate-400">
              Updated {new Date(ticket.updated_at || ticket.created_at).toLocaleString('en-IN')}
            </p>
          </CardContent>
        </Card>
      ))}
    </>
  );
}
