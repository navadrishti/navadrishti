'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Header } from '@/components/header';
import { DocumentFileViewer } from '@/components/ca-verification-review';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

type SupportTicket = {
  id: number;
  ticket_id: string;
  title: string;
  description: string;
  proof_url?: string | null;
  status: TicketStatus;
  created_at: string;
  updated_at: string;
  resolved_at?: string | null;
};

type SupportMessage = {
  id: number | string;
  sender_type: string;
  message_type?: string;
  content: string;
  attachment_url?: string | null;
  created_at: string;
};

const statusTone = (status: TicketStatus) => {
  if (status === 'open') return 'border-udaan-blue/30 bg-udaan-blue/10 text-udaan-blue';
  if (status === 'in_progress') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (status === 'resolved') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  return 'border-slate-200 bg-slate-100 text-slate-700';
};

const isClosedStatus = (status: TicketStatus) => status === 'resolved' || status === 'closed';

const tabButtonClass = (active: boolean) =>
  cn(
    'rounded-md border px-4 py-2 text-sm font-medium',
    active
      ? 'border-udaan-blue bg-udaan-blue text-white'
      : 'border-slate-200 bg-white text-slate-700'
  );

const filterButtonClass = (active: boolean) =>
  cn(
    'inline-flex h-10 w-full items-center justify-center whitespace-nowrap rounded-md border px-2 text-sm font-medium',
    active
      ? 'border-udaan-blue bg-udaan-blue text-white'
      : 'border-slate-200 bg-white text-slate-700'
  );

export default function HelpSupportPage() {
  const router = useRouter();
  const { user, token } = useAuth();
  const { toast } = useToast();

  const [view, setView] = useState<'new' | 'inbox'>('inbox');
  const [ticketBucket, setTicketBucket] = useState<'open' | 'closed' | 'all'>('open');
  const [ticketStatusFilter, setTicketStatusFilter] = useState<TicketStatus | 'all'>('all');
  const [ticketQuery, setTicketQuery] = useState('');
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [viewingDoc, setViewingDoc] = useState<{ url: string; label: string } | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replyMessage, setReplyMessage] = useState('');
  const [replying, setReplying] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [proof, setProof] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const visibleTickets = useMemo(() => {
    const query = ticketQuery.trim().toLowerCase();
    return tickets.filter((ticket) => {
      const bucketPass =
        ticketBucket === 'all'
          ? true
          : ticketBucket === 'open'
            ? !isClosedStatus(ticket.status)
            : isClosedStatus(ticket.status);
      if (!bucketPass) return false;

      const statusPass = ticketStatusFilter === 'all' || ticket.status === ticketStatusFilter;
      if (!statusPass) return false;
      if (!query) return true;
      return (
        String(ticket.title || '').toLowerCase().includes(query)
        || String(ticket.description || '').toLowerCase().includes(query)
        || String(ticket.ticket_id || '').toLowerCase().includes(query)
      );
    });
  }, [ticketBucket, ticketStatusFilter, ticketQuery, tickets]);

  const loadTickets = useCallback(async () => {
    if (!token) return;
    try {
      setInboxLoading(true);
      const response = await fetch('/api/help-support/tickets', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Failed to load tickets');
      }
      setTickets(Array.isArray(payload.tickets) ? payload.tickets : []);
    } catch (error: any) {
      toast({ title: 'Could not load tickets', description: error?.message || 'Please try again.', variant: 'destructive' });
      setTickets([]);
    } finally {
      setInboxLoading(false);
    }
  }, [token, toast]);

  const loadTicketDetail = useCallback(async (ticketId: string) => {
    if (!token) return;
    try {
      setDetailLoading(true);
      const response = await fetch(`/api/help-support/tickets/${encodeURIComponent(ticketId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Failed to load ticket');
      }
      setSelectedTicket(payload.ticket || null);
      setMessages(Array.isArray(payload.messages) ? payload.messages : []);
    } catch (error: any) {
      toast({ title: 'Could not load ticket', description: error?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setDetailLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    if (user && token && view === 'inbox') {
      loadTickets();
    }
  }, [user, token, view, loadTickets]);

  useEffect(() => {
    if (selectedTicketId && token) {
      loadTicketDetail(selectedTicketId);
    } else {
      setSelectedTicket(null);
      setMessages([]);
    }
  }, [selectedTicketId, token, loadTicketDetail]);

  const selectTicket = (ticket: SupportTicket) => {
    setSelectedTicketId(ticket.ticket_id);
    setViewingDoc(null);
    setReplyMessage('');
  };

  const handleSubmit = async () => {
    if (!user || !token) {
      toast({ title: 'Login required', description: 'Please log in to submit a support ticket.', variant: 'destructive' });
      router.push('/login');
      return;
    }

    if (title.trim().length < 3) {
      toast({ title: 'Title required', description: 'Please enter a clear issue title.', variant: 'destructive' });
      return;
    }

    if (description.trim().length < 10) {
      toast({ title: 'Description required', description: 'Please describe the issue in a little more detail.', variant: 'destructive' });
      return;
    }

    if (!proof) {
      toast({ title: 'Proof required', description: 'Please upload proof for the issue.', variant: 'destructive' });
      return;
    }

    const formData = new FormData();
    formData.append('title', title.trim());
    formData.append('description', description.trim());
    formData.append('proof', proof);

    setSubmitting(true);
    try {
      const response = await fetch('/api/help-support', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        toast({ title: 'Submission failed', description: payload?.error || 'Could not submit your ticket.', variant: 'destructive' });
        return;
      }

      const ticketId = payload.data?.ticketId as string;
      toast({ title: 'Ticket submitted', description: `Reference ${ticketId}` });
      setTitle('');
      setDescription('');
      setProof(null);
      setView('inbox');
      setTicketFilter('open');
      await loadTickets();
      if (ticketId) {
        setSelectedTicketId(ticketId);
      }
    } catch {
      toast({ title: 'Submission failed', description: 'Could not submit your ticket.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const sendReply = async () => {
    if (!selectedTicketId || !token || !replyMessage.trim()) {
      toast({ title: 'Message required', description: 'Write a message before sending.', variant: 'destructive' });
      return;
    }

    setReplying(true);
    try {
      const response = await fetch(`/api/help-support/tickets/${encodeURIComponent(selectedTicketId)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: replyMessage.trim() }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Failed to send message');
      }
      setSelectedTicket(payload.ticket || null);
      setMessages(Array.isArray(payload.messages) ? payload.messages : []);
      setReplyMessage('');
      setTickets((prev) =>
        prev.map((ticket) => (ticket.ticket_id === selectedTicketId ? { ...ticket, ...(payload.ticket || {}) } : ticket))
      );
      toast({ title: 'Message sent', description: 'The support team has been notified.' });
    } catch (error: any) {
      toast({ title: 'Send failed', description: error?.message || 'Could not send your message.', variant: 'destructive' });
    } finally {
      setReplying(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="px-0 text-udaan-blue hover:bg-transparent hover:text-udaan-blue/80"
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
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-slate-900">Raise a Support Ticket</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {!user ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>Please log in to raise a ticket.</AlertDescription>
                </Alert>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="ticket-title">Title</Label>
                <Input
                  id="ticket-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Short summary of the issue"
                  className="border-slate-200"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ticket-description">Description</Label>
                <Textarea
                  id="ticket-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={6}
                  placeholder="Describe what happened, when it happened, and what you need help with."
                  className="border-slate-200"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ticket-proof">Proof</Label>
                <Input
                  id="ticket-proof"
                  type="file"
                  accept="image/*,.pdf,.doc,.docx"
                  onChange={(e) => setProof(e.target.files?.[0] || null)}
                  className="border-slate-200 bg-white"
                />
                <p className="text-xs text-slate-500">Upload a screenshot, PDF, or document that supports your issue.</p>
                {proof ? <p className="text-xs font-medium text-slate-700">Selected: {proof.name}</p> : null}
              </div>

              <Button
                onClick={handleSubmit}
                disabled={submitting || !user}
                className="bg-udaan-blue text-white hover:bg-udaan-blue/90"
              >
                {submitting ? 'Submitting...' : 'Submit Ticket'}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="min-w-0 space-y-4">
              <Card className="border-slate-200 bg-white shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg text-slate-900">Ticket Inbox</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {!user ? (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>Please log in to view your support tickets.</AlertDescription>
                    </Alert>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ticket bucket</p>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setTicketBucket('open');
                              setTicketStatusFilter('all');
                            }}
                            className={filterButtonClass(ticketBucket === 'open')}
                          >
                            Open Tickets
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTicketBucket('closed');
                              setTicketStatusFilter('all');
                            }}
                            className={filterButtonClass(ticketBucket === 'closed')}
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
                              setTicketStatusFilter('open');
                              setTicketBucket('open');
                            }}
                            className={filterButtonClass(ticketStatusFilter === 'open')}
                          >
                            Open
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTicketStatusFilter('in_progress');
                              setTicketBucket('open');
                            }}
                            className={filterButtonClass(ticketStatusFilter === 'in_progress')}
                          >
                            In Progress
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTicketStatusFilter('resolved');
                              setTicketBucket('closed');
                            }}
                            className={filterButtonClass(ticketStatusFilter === 'resolved')}
                          >
                            Resolved
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTicketStatusFilter('closed');
                              setTicketBucket('closed');
                            }}
                            className={filterButtonClass(ticketStatusFilter === 'closed')}
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

              {user ? (
                inboxLoading ? (
                  <Card className="border-slate-200 bg-white shadow-sm">
                    <CardContent className="py-10 text-center text-slate-500">Loading tickets...</CardContent>
                  </Card>
                ) : visibleTickets.length === 0 ? (
                  <Card className="border-slate-200 bg-white shadow-sm">
                    <CardContent className="py-10 text-center text-slate-500">
                      No tickets found for this filter.
                      <div className="mt-3">
                        <Button
                          size="sm"
                          onClick={() => setView('new')}
                          className="bg-udaan-blue text-white hover:bg-udaan-blue/90"
                        >
                          Raise a ticket
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  visibleTickets.map((ticket) => (
                    <Card
                      key={ticket.ticket_id}
                      className={cn(
                        'cursor-pointer border border-slate-200 bg-white shadow-sm outline-none',
                        selectedTicketId === ticket.ticket_id
                          ? 'border-udaan-blue bg-udaan-blue/[0.04]'
                          : 'border-slate-200'
                      )}
                      onClick={() => selectTicket(ticket)}
                    >
                      <CardContent className="space-y-2 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-900">{ticket.title}</p>
                            <p className="text-xs text-slate-500">{ticket.ticket_id}</p>
                          </div>
                          <span className={cn('shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize', statusTone(ticket.status))}>
                            {ticket.status.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="line-clamp-2 text-sm text-slate-600">{ticket.description}</p>
                        <p className="text-xs text-slate-400">
                          Updated {new Date(ticket.updated_at || ticket.created_at).toLocaleString('en-IN')}
                        </p>
                      </CardContent>
                    </Card>
                  ))
                )
              ) : null}
            </div>

            <div className="min-w-0">
              <Card className="border-slate-200 bg-white shadow-sm lg:sticky lg:top-20">
                <CardHeader>
                  <CardTitle className="text-slate-900">Ticket Details</CardTitle>
                </CardHeader>
                <CardContent>
                  {!selectedTicketId || !selectedTicket ? (
                    <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                      Select a ticket to view messages and reply.
                    </p>
                  ) : detailLoading ? (
                    <p className="text-sm text-slate-500">Loading ticket...</p>
                  ) : viewingDoc ? (
                    <DocumentFileViewer
                      url={viewingDoc.url}
                      label={viewingDoc.label}
                      onBack={() => setViewingDoc(null)}
                    />
                  ) : (
                    <div className="space-y-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs text-slate-500">Ticket ID</p>
                          <p className="text-lg font-semibold text-slate-900">{selectedTicket.ticket_id}</p>
                        </div>
                        <span className={cn('rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize', statusTone(selectedTicket.status))}>
                          {selectedTicket.status.replace('_', ' ')}
                        </span>
                      </div>

                      <div className="space-y-2">
                        <p className="text-sm font-medium text-slate-500">Title</p>
                        <p className="rounded-md border border-slate-200 bg-white p-3 text-sm">{selectedTicket.title}</p>
                      </div>

                      {selectedTicket.proof_url ? (
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-slate-500">Proof</p>
                          <button
                            type="button"
                            onClick={() =>
                              setViewingDoc({
                                url: selectedTicket.proof_url!,
                                label: `Proof · ${selectedTicket.ticket_id}`,
                              })
                            }
                            className="inline-flex rounded-md border border-slate-200 px-3 py-2 text-sm text-udaan-blue"
                          >
                            Open attached proof
                          </button>
                        </div>
                      ) : null}

                      <div className="space-y-2">
                        <p className="text-sm font-medium text-slate-500">Messages</p>
                        {messages.length === 0 ? (
                          <p className="text-sm text-slate-500">No messages yet.</p>
                        ) : (
                          <div className="max-h-80 space-y-3 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-4">
                            {messages.map((message) => (
                              <div
                                key={message.id}
                                className={cn(
                                  'rounded-lg border p-3 text-sm',
                                  message.sender_type === 'admin'
                                    ? 'border-udaan-blue/20 bg-udaan-blue/5'
                                    : 'border-slate-200 bg-white'
                                )}
                              >
                                <div className="mb-1 flex items-center justify-between gap-2 text-xs text-slate-500">
                                  <span className="font-medium capitalize text-slate-700">
                                    {message.sender_type === 'admin' ? 'Support team' : 'You'}
                                  </span>
                                  <span>{new Date(message.created_at).toLocaleString('en-IN')}</span>
                                </div>
                                <p className="whitespace-pre-wrap text-slate-800">{message.content}</p>
                                {message.attachment_url ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setViewingDoc({
                                        url: message.attachment_url!,
                                        label: 'Attachment',
                                      })
                                    }
                                    className="mt-2 inline-block text-xs text-udaan-blue"
                                  >
                                    View attachment
                                  </button>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {selectedTicket.status === 'closed' ? (
                        <Alert>
                          <AlertDescription>
                            This ticket is closed. Open a new ticket if you need further help.
                          </AlertDescription>
                        </Alert>
                      ) : (
                        <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
                          <p className="text-sm font-medium text-slate-900">Reply to support</p>
                          <Textarea
                            value={replyMessage}
                            onChange={(e) => setReplyMessage(e.target.value)}
                            rows={4}
                            placeholder="Write your follow-up message"
                            className="border-slate-200"
                          />
                          <Button
                            onClick={sendReply}
                            disabled={replying}
                            className="bg-udaan-blue text-white hover:bg-udaan-blue/90"
                          >
                            {replying ? 'Sending...' : 'Send Message'}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
