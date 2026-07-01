'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, FileText, Inbox, LifeBuoy, Send } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Header } from '@/components/header';
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
  if (status === 'open') return 'bg-blue-100 text-blue-800';
  if (status === 'in_progress') return 'bg-amber-100 text-amber-800';
  if (status === 'resolved') return 'bg-emerald-100 text-emerald-800';
  return 'bg-slate-100 text-slate-700';
};

const isClosedStatus = (status: TicketStatus) => status === 'resolved' || status === 'closed';

export default function HelpSupportPage() {
  const router = useRouter();
  const { user, token } = useAuth();
  const { toast } = useToast();

  const [view, setView] = useState<'new' | 'inbox'>('inbox');
  const [ticketFilter, setTicketFilter] = useState<'open' | 'closed'>('open');
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
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
    return tickets.filter((ticket) =>
      ticketFilter === 'open' ? !isClosedStatus(ticket.status) : isClosedStatus(ticket.status)
    );
  }, [ticketFilter, tickets]);

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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <Header />
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => router.back()} className="px-0 text-blue-600 hover:bg-transparent hover:text-blue-800">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          <Button
            variant={view === 'inbox' ? 'default' : 'outline'}
            onClick={() => setView('inbox')}
            className={view === 'inbox' ? 'bg-blue-600 hover:bg-blue-500' : 'border-blue-200 bg-white text-blue-700'}
          >
            <Inbox className="mr-2 h-4 w-4" />
            My Tickets
          </Button>
          <Button
            variant={view === 'new' ? 'default' : 'outline'}
            onClick={() => setView('new')}
            className={view === 'new' ? 'bg-blue-600 hover:bg-blue-500' : 'border-blue-200 bg-white text-blue-700'}
          >
            <FileText className="mr-2 h-4 w-4" />
            New Ticket
          </Button>
        </div>

        {view === 'new' ? (
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <Card className="lg:sticky lg:top-20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <LifeBuoy className="h-5 w-5 text-blue-600" />
                    Help & Support
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-slate-600">
                  <p>Raise a ticket and track replies here in your inbox.</p>
                  <p>Refunds are handled only by admin. You cannot initiate refunds from this page.</p>
                  <p>Attach proof so the team can verify the issue faster.</p>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-8">
              <Card>
                <CardHeader>
                  <CardTitle>Raise a Support Ticket</CardTitle>
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
                    <Input id="ticket-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short summary of the issue" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ticket-description">Description</Label>
                    <Textarea
                      id="ticket-description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={6}
                      placeholder="Describe what happened, when it happened, and what you need help with."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ticket-proof">Proof</Label>
                    <div className="rounded-lg border border-dashed bg-white p-4">
                      <Input
                        id="ticket-proof"
                        type="file"
                        accept="image/*,.pdf,.doc,.docx"
                        onChange={(e) => setProof(e.target.files?.[0] || null)}
                      />
                      <p className="mt-2 text-xs text-slate-500">Upload a screenshot, PDF, or document that supports your issue.</p>
                      {proof ? <p className="mt-2 text-xs font-medium text-slate-700">Selected: {proof.name}</p> : null}
                    </div>
                  </div>

                  <Button onClick={handleSubmit} disabled={submitting || !user} className="w-full bg-blue-600 hover:bg-blue-500">
                    {submitting ? 'Submitting...' : 'Submit Ticket'}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="min-w-0 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Ticket Inbox</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {!user ? (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>Please log in to view your support tickets.</AlertDescription>
                    </Alert>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setTicketFilter('open')}
                          className={cn(
                            'rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                            ticketFilter === 'open' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-700'
                          )}
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          onClick={() => setTicketFilter('closed')}
                          className={cn(
                            'rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                            ticketFilter === 'closed' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-700'
                          )}
                        >
                          Closed
                        </button>
                      </div>
                      <Button variant="outline" className="w-full border-blue-200 text-blue-700" onClick={loadTickets} disabled={inboxLoading}>
                        {inboxLoading ? 'Refreshing...' : 'Refresh'}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>

              {user ? (
                inboxLoading ? (
                  <Card>
                    <CardContent className="py-10 text-center text-slate-500">Loading tickets...</CardContent>
                  </Card>
                ) : visibleTickets.length === 0 ? (
                  <Card>
                    <CardContent className="py-10 text-center text-slate-500">
                      No {ticketFilter} tickets yet.
                      <div className="mt-3">
                        <Button size="sm" onClick={() => setView('new')} className="bg-blue-600 hover:bg-blue-500">
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
                        'cursor-pointer transition-all hover:border-blue-300',
                        selectedTicketId === ticket.ticket_id ? 'border-blue-400 ring-1 ring-blue-200' : 'border-slate-200'
                      )}
                      onClick={() => selectTicket(ticket)}
                    >
                      <CardContent className="space-y-2 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-900">{ticket.title}</p>
                            <p className="text-xs text-slate-500">{ticket.ticket_id}</p>
                          </div>
                          <Badge className={cn('shrink-0 capitalize', statusTone(ticket.status))}>{ticket.status.replace('_', ' ')}</Badge>
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
              <Card className="lg:sticky lg:top-20">
                <CardHeader>
                  <CardTitle>Ticket Details</CardTitle>
                </CardHeader>
                <CardContent>
                  {!selectedTicketId || !selectedTicket ? (
                    <p className="rounded-md border bg-white p-4 text-sm text-slate-600">
                      Select a ticket to view messages and reply.
                    </p>
                  ) : detailLoading ? (
                    <p className="text-sm text-slate-500">Loading ticket...</p>
                  ) : (
                    <div className="space-y-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs text-slate-500">Ticket ID</p>
                          <p className="text-lg font-semibold text-slate-900">{selectedTicket.ticket_id}</p>
                        </div>
                        <Badge className={cn('capitalize', statusTone(selectedTicket.status))}>
                          {selectedTicket.status.replace('_', ' ')}
                        </Badge>
                      </div>

                      <div className="space-y-2">
                        <p className="text-sm font-medium text-slate-500">Title</p>
                        <p className="rounded-md border bg-white p-3 text-sm">{selectedTicket.title}</p>
                      </div>

                      {selectedTicket.proof_url ? (
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-slate-500">Proof</p>
                          <a
                            href={selectedTicket.proof_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex rounded-md border px-3 py-2 text-sm text-blue-700 hover:bg-blue-50"
                          >
                            Open attached proof
                          </a>
                        </div>
                      ) : null}

                      <div className="space-y-2">
                        <p className="text-sm font-medium text-slate-500">Messages</p>
                        {messages.length === 0 ? (
                          <p className="text-sm text-slate-500">No messages yet.</p>
                        ) : (
                          <div className="max-h-80 space-y-3 overflow-y-auto rounded-lg border bg-slate-50 p-4">
                            {messages.map((message) => (
                              <div
                                key={message.id}
                                className={cn(
                                  'rounded-lg border p-3 text-sm',
                                  message.sender_type === 'admin' ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white'
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
                                  <a
                                    href={message.attachment_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-2 inline-block text-xs text-blue-700 hover:underline"
                                  >
                                    View attachment
                                  </a>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {selectedTicket.status === 'closed' ? (
                        <Alert>
                          <AlertDescription>This ticket is closed. Open a new ticket if you need further help.</AlertDescription>
                        </Alert>
                      ) : (
                        <div className="space-y-2 rounded-lg border bg-white p-4">
                          <p className="text-sm font-medium text-slate-900">Reply to support</p>
                          <Textarea
                            value={replyMessage}
                            onChange={(e) => setReplyMessage(e.target.value)}
                            rows={4}
                            placeholder="Write your follow-up message"
                          />
                          <Button onClick={sendReply} disabled={replying} className="bg-blue-600 hover:bg-blue-500">
                            <Send className="mr-2 h-4 w-4" />
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
