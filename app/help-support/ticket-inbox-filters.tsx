'use client';

import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { filterButtonClass } from './helpers';
import type { TicketBucket, TicketStatus } from './types';
import type { SupportTicketsState } from './use-support-tickets';

const BUCKET_FILTERS: Array<{ bucket: Exclude<TicketBucket, 'all'>; label: string }> = [
  { bucket: 'open', label: 'Open Tickets' },
  { bucket: 'closed', label: 'Closed Tickets' },
];

const STATUS_FILTERS: Array<{ status: TicketStatus; bucket: Exclude<TicketBucket, 'all'>; label: string }> = [
  { status: 'open', bucket: 'open', label: 'Open' },
  { status: 'in_progress', bucket: 'open', label: 'In Progress' },
  { status: 'resolved', bucket: 'closed', label: 'Resolved' },
  { status: 'closed', bucket: 'closed', label: 'Closed' },
];

export function TicketInboxFilters({ inbox, isLoggedIn }: { inbox: SupportTicketsState; isLoggedIn: boolean }) {
  const {
    ticketBucket,
    setTicketBucket,
    ticketStatusFilter,
    setTicketStatusFilter,
    ticketQuery,
    setTicketQuery,
    inboxLoading,
    loadTickets,
  } = inbox;

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg text-slate-900">Ticket Inbox</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!isLoggedIn ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Please log in to view your support tickets.</AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ticket bucket</p>
              <div className="grid grid-cols-2 gap-2">
                {BUCKET_FILTERS.map(({ bucket, label }) => (
                  <button
                    key={bucket}
                    type="button"
                    onClick={() => {
                      setTicketBucket(bucket);
                      setTicketStatusFilter('all');
                    }}
                    className={filterButtonClass(ticketBucket === bucket)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {STATUS_FILTERS.map(({ status, bucket, label }) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => {
                      setTicketStatusFilter(status);
                      setTicketBucket(bucket);
                    }}
                    className={filterButtonClass(ticketStatusFilter === status)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full border-slate-200 bg-white text-slate-700"
                onClick={() => {
                  setTicketBucket('all');
                  setTicketStatusFilter('all');
                }}
              >
                Show all
              </Button>
              <Button
                type="button"
                className="h-10 w-full bg-udaan-blue text-white hover:bg-udaan-blue/90"
                onClick={loadTickets}
                disabled={inboxLoading}
              >
                {inboxLoading ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>

            <Input
              value={ticketQuery}
              onChange={(e) => setTicketQuery(e.target.value)}
              placeholder="Search title, description, ticket ID"
              className="h-10 border-slate-200 bg-white"
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
