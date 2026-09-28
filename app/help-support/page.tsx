'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/header';
import { tabButtonClass } from './helpers';
import { NewTicketForm } from './new-ticket-form';
import { TicketDetailCard } from './ticket-detail-card';
import { TicketInboxFilters } from './ticket-inbox-filters';
import { TicketList } from './ticket-list';
import { useNewTicket } from './use-new-ticket';
import { useSupportTickets } from './use-support-tickets';
import type { SupportView } from './types';

export default function HelpSupportPage() {
  const router = useRouter();
  const { user, token } = useAuth();
  const isLoggedIn = Boolean(user);

  const [view, setView] = useState<SupportView>('inbox');
  const inbox = useSupportTickets(token, isLoggedIn && view === 'inbox');
  const newTicket = useNewTicket(isLoggedIn, token, async (ticketId) => {
    setView('inbox');
    inbox.setTicketBucket('open');
    await inbox.loadTickets();
    if (ticketId) {
      inbox.setSelectedTicketId(ticketId);
    }
  });

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="px-0 text-primary hover:bg-transparent hover:text-primary/80"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>

        <div className="mb-6 space-y-2">
          <h1 className="text-2xl font-bold text-slate-900">Help & Support</h1>
          <p className="max-w-2xl text-sm text-slate-600">
            Raise a ticket and track replies here. Attach proof so the team can verify the issue faster.
          </p>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          <button type="button" onClick={() => setView('inbox')} className={tabButtonClass(view === 'inbox')}>
            My Tickets
          </button>
          <button type="button" onClick={() => setView('new')} className={tabButtonClass(view === 'new')}>
            New Ticket
          </button>
        </div>

        {view === 'new' ? (
          <NewTicketForm form={newTicket} isLoggedIn={isLoggedIn} />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="min-w-0 space-y-4">
              <TicketInboxFilters inbox={inbox} isLoggedIn={isLoggedIn} />

              {isLoggedIn ? (
                <TicketList
                  tickets={inbox.visibleTickets}
                  loading={inbox.inboxLoading}
                  selectedTicketId={inbox.selectedTicketId}
                  onSelect={inbox.selectTicket}
                  onRaiseTicket={() => setView('new')}
                />
              ) : null}
            </div>

            <div className="min-w-0">
              <TicketDetailCard inbox={inbox} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
