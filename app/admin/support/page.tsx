'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3, MessageSquareText, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';

type SupportTicket = {
  id: number;
type SupportTicketMessage = {
  id: number;
  ticket_id: string;
  sender_id: number;
  sender_type: 'user' | 'admin' | string;
  message_type: string;
  content: string;
  attachment_url?: string | null;
  created_at: string;
  sender?: {
    id?: number;
    name?: string;
    email?: string;
    user_type?: string;
    profile_image?: string | null;
  };
};
  ticket_id: string;
  user_id: number;
  user_name?: string | null;
  const [messages, setMessages] = useState<SupportTicketMessage[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  user_email?: string | null;
  user_type?: string | null;
  title: string;
  description: string;
  proof_url?: string | null;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  admin_notes?: string | null;
  resolved_at?: string | null;
  created_at: string;
  updated_at?: string | null;
    loadTicketDetails(ticket.ticket_id);
  user?: {
    id?: number;
  const loadTicketDetails = async (ticketId: string) => {
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/admin/support-tickets/${encodeURIComponent(ticketId)}`, { credentials: 'include' });
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to load ticket details');
      }

      setSelectedTicket(data.ticket);
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      setAdminNotes(data.ticket?.admin_notes || '');
      setStatusUpdate(data.ticket?.status || 'open');
    } catch (error: any) {
      toast({ title: 'Failed to load ticket details', description: error?.message || 'Could not load ticket thread', variant: 'destructive' });
    } finally {
      setDetailLoading(false);
    }
  };
    name?: string;
    email?: string;
    user_type?: string;
    verification_status?: string;
    profile_image?: string | null;
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          ticket_id: data.ticket.ticket_id,
          sender_id: 0,
          sender_type: 'admin',
          message_type: 'admin_reply',
          content: replyMessage,
          created_at: new Date().toISOString(),
        }
      ]);
  };
};

const statusLabels: Record<SupportTicket['status'], string> = {
  open: 'Open',
  in_progress: 'In Progress',
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          ticket_id: selectedTicket.ticket_id,
          sender_id: 0,
          sender_type: 'admin',
          message_type: 'refund_initiated',
          content: `Refund initiated for payment ${refundPaymentId} (request ${refundRequestId})`,
          created_at: new Date().toISOString(),
        }
      ]);
  resolved: 'Resolved',
  closed: 'Closed',
};

const statusClasses: Record<SupportTicket['status'], string> = {

                    <div className="space-y-3 rounded-lg border bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-gray-900">Conversation Thread</p>
                      {detailLoading ? (
                        <p className="text-sm text-slate-500">Loading conversation...</p>
                      ) : messages.length === 0 ? (
                        <p className="text-sm text-slate-500">No messages yet.</p>
                      ) : (
                        <div className="space-y-3">
                          {messages.map((message) => (
                            <div key={message.id} className={`rounded-lg border p-3 text-sm ${message.sender_type === 'admin' ? 'bg-blue-50 border-blue-200' : 'bg-white'}`}>
                              <div className="mb-1 flex items-center justify-between gap-2 text-xs text-slate-500">
                                <span className="font-medium capitalize text-slate-700">{message.sender_type}</span>
                                <span>{new Date(message.created_at).toLocaleString('en-IN', { timeZone: 'UTC' })}</span>
                              </div>
                              <p className="whitespace-pre-wrap text-slate-800">{message.content}</p>
                              {message.attachment_url ? (
                                <a href={message.attachment_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-blue-700 underline">
                                  View attachment
                                </a>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
  open: 'bg-red-100 text-red-800 border-red-200',
                    

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to fetch tickets');
      }

      setTickets(Array.isArray(data.tickets) ? data.tickets : []);
    } catch (error: any) {
      toast({ title: 'Failed to load tickets', description: error?.message || 'Unable to fetch tickets', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const verifyAdmin = async () => {
      try {
        const response = await fetch('/api/admin/verify', { credentials: 'include' });
        if (!response.ok) {
          router.push('/admin/login');
          return;
        }
        setIsAdmin(true);
      } catch {
        router.push('/admin/login');
      }
    };

    verifyAdmin();
  }, [router]);

  useEffect(() => {
    if (isAdmin) {
      fetchTickets();
    }
  }, [isAdmin, activeTab]);

  const filteredTickets = useMemo(() => tickets, [tickets]);

  const selectTicket = (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setStatusUpdate(ticket.status);
    setAdminNotes(ticket.admin_notes || '');
    setReplyMessage('');
    setRefundRequestId('');
    setRefundPaymentId('');
    setRefundAmount('');
    setRefundReason('admin_support_refund');
  };

  const sendReply = async () => {
    if (!selectedTicket || !replyMessage.trim()) {
      toast({ title: 'Reply required', description: 'Enter a reply message before sending.', variant: 'destructive' });
      return;
    }

    setReplying(true);
    try {
      const response = await fetch(`/api/admin/support-tickets/${encodeURIComponent(selectedTicket.ticket_id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          status: statusUpdate,
          admin_notes: adminNotes,
          reply_message: replyMessage,
        })
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to send reply');
      }

      toast({ title: 'Reply sent', description: `A reply was sent for ${selectedTicket.ticket_id}` });
      setSelectedTicket(data.ticket);
      setTickets((prev) => prev.map((ticket) => ticket.ticket_id === data.ticket.ticket_id ? data.ticket : ticket));
      setReplyMessage('');
    } catch (error: any) {
      toast({ title: 'Reply failed', description: error?.message || 'Could not send reply', variant: 'destructive' });
    } finally {
      setReplying(false);
    }
  };

  const initiateRefund = async () => {
    if (!selectedTicket) return;

    if (!refundRequestId.trim() || !refundPaymentId.trim()) {
      toast({ title: 'Refund details required', description: 'Enter the service request ID and payment ID.', variant: 'destructive' });
      return;
    }

    setRefunding(true);
    try {
      const response = await fetch(`/api/admin/support-tickets/${encodeURIComponent(selectedTicket.ticket_id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          service_request_id: refundRequestId,
          razorpay_payment_id: refundPaymentId,
          amount: refundAmount,
          reason: refundReason,
        })
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to initiate refund');
      }

      toast({ title: 'Refund initiated', description: data?.data?.message || 'Refund request sent to Razorpay.' });
      setTickets((prev) => prev.map((ticket) => ticket.ticket_id === selectedTicket.ticket_id ? { ...ticket, status: 'resolved' } : ticket));
      setSelectedTicket((prev) => prev ? { ...prev, status: 'resolved' } : prev);
    } catch (error: any) {
      toast({ title: 'Refund failed', description: error?.message || 'Could not initiate refund', variant: 'destructive' });
    } finally {
      setRefunding(false);
    }
  };

  const updateSelectedTicket = async () => {
    if (!selectedTicket) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/admin/support-tickets/${encodeURIComponent(selectedTicket.ticket_id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          status: statusUpdate,
          admin_notes: adminNotes,
        })
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to update ticket');
      }

      toast({ title: 'Ticket updated', description: `${selectedTicket.ticket_id} updated successfully` });
      setSelectedTicket(data.ticket);
      setTickets((prev) => prev.map((ticket) => ticket.ticket_id === data.ticket.ticket_id ? data.ticket : ticket));
    } catch (error: any) {
      toast({ title: 'Update failed', description: error?.message || 'Could not update ticket', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <Button variant="outline" onClick={() => router.back()} className="mb-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <h1 className="text-3xl font-bold text-gray-900">Support Inbox</h1>
            <p className="mt-1 text-gray-600">Review user issues, proofs, and resolution notes</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  Search
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search title, description, ticket ID" />
                <Button onClick={fetchTickets} className="w-full">Search</Button>
              </CardContent>
            </Card>

            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="open">Open</TabsTrigger>
                <TabsTrigger value="in_progress">In Progress</TabsTrigger>
                <TabsTrigger value="resolved">Resolved</TabsTrigger>
                <TabsTrigger value="closed">Closed</TabsTrigger>
              </TabsList>

              <TabsContent value={activeTab} className="mt-4 space-y-3">
                {loading ? (
                  <Card>
                    <CardContent className="py-10 text-center text-gray-500">Loading tickets...</CardContent>
                  </Card>
                ) : filteredTickets.length === 0 ? (
                  <Card>
                    <CardContent className="py-10 text-center text-gray-500">No tickets found for this status.</CardContent>
                  </Card>
                ) : (
                  filteredTickets.map((ticket) => (
                    <Card key={ticket.ticket_id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => selectTicket(ticket)}>
                      <CardContent className="p-4 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-gray-900">{ticket.title}</p>
                            <p className="text-xs text-gray-500">{ticket.ticket_id} • {ticket.user_name || ticket.user?.name || 'Unknown user'}</p>
                          </div>
                          <Badge className={`capitalize ${statusClasses[ticket.status]}`}>{statusLabels[ticket.status]}</Badge>
                        </div>
                        <p className="line-clamp-2 text-sm text-gray-600">{ticket.description}</p>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>
            </Tabs>
          </div>

          <div className="lg:col-span-8">
            <Card className="sticky top-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquareText className="h-5 w-5" />
                  Ticket Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!selectedTicket ? (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>Select a ticket to review the issue, proof, and resolution controls.</AlertDescription>
                  </Alert>
                ) : (
                  <div className="space-y-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm text-gray-500">Ticket ID</p>
                        <p className="text-lg font-semibold">{selectedTicket.ticket_id}</p>
                      </div>
                      <Badge className={`capitalize ${statusClasses[selectedTicket.status]}`}>{statusLabels[selectedTicket.status]}</Badge>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 text-sm">
                      <div>
                        <p className="text-gray-500">Raised By</p>
                        <p className="font-medium">{selectedTicket.user_name || selectedTicket.user?.name || 'Unknown'}</p>
                        <p className="text-gray-500">{selectedTicket.user_email || selectedTicket.user?.email || 'No email'}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">User Type</p>
                        <p className="font-medium capitalize">{selectedTicket.user_type || selectedTicket.user?.user_type || 'Unknown'}</p>
                        <p className="text-gray-500">Created {new Date(selectedTicket.created_at).toLocaleString('en-IN', { timeZone: 'UTC' })}</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-medium text-gray-500">Title</p>
                      <p className="rounded-md border bg-white p-3 text-sm">{selectedTicket.title}</p>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-medium text-gray-500">Description</p>
                      <p className="whitespace-pre-wrap rounded-md border bg-white p-3 text-sm">{selectedTicket.description}</p>
                    </div>

                    {selectedTicket.proof_url ? (
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-gray-500">Proof</p>
                        <a href={selectedTicket.proof_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-blue-700 hover:bg-blue-50">
                          Open attached proof
                        </a>
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <p className="text-sm font-medium text-gray-500">Admin Notes</p>
                      <Textarea value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} rows={4} placeholder="Internal resolution notes" />
                    </div>

                    <div className="space-y-2 rounded-lg border bg-white p-4">
                      <p className="text-sm font-semibold text-gray-900">Reply to User</p>
                      <Textarea value={replyMessage} onChange={(e) => setReplyMessage(e.target.value)} rows={4} placeholder="Write the message the user should receive" />
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Button onClick={sendReply} disabled={replying} className="sm:w-auto">
                          {replying ? 'Sending...' : 'Send Reply'}
                        </Button>
                        <Button variant="outline" onClick={() => setStatusUpdate('in_progress')} className="sm:w-auto">
                          Mark In Progress
                        </Button>
                        <Button variant="outline" onClick={() => setStatusUpdate('resolved')} className="sm:w-auto">
                          Mark Resolved
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-3 rounded-lg border bg-amber-50 p-4">
                      <p className="text-sm font-semibold text-amber-900">Refund Initiation</p>
                      <p className="text-xs text-amber-800">Admin can initiate refunds directly from here. Users cannot initiate refunds from the platform.</p>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-2 md:col-span-2">
                          <label className="text-sm font-medium text-gray-700">Service Request ID</label>
                          <Input value={refundRequestId} onChange={(e) => setRefundRequestId(e.target.value)} placeholder="Enter request ID linked to the payment" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-gray-700">Razorpay Payment ID</label>
                          <Input value={refundPaymentId} onChange={(e) => setRefundPaymentId(e.target.value)} placeholder="pay_xxxxx" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-gray-700">Refund Amount (optional)</label>
                          <Input value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} placeholder="Leave blank for full refund" />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <label className="text-sm font-medium text-gray-700">Refund Reason</label>
                          <Input value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder="admin_support_refund" />
                        </div>
                      </div>
                      <Button variant="destructive" onClick={initiateRefund} disabled={refunding}>
                        {refunding ? 'Initiating refund...' : 'Initiate Refund'}
                      </Button>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-gray-500">Update Status</p>
                        <select
                          value={statusUpdate}
                          onChange={(e) => setStatusUpdate(e.target.value as any)}
                          className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                        >
                          <option value="open">Open</option>
                          <option value="in_progress">In Progress</option>
                          <option value="resolved">Resolved</option>
                          <option value="closed">Closed</option>
                        </select>
                      </div>
                      <div className="flex items-end">
                        <Button onClick={updateSelectedTicket} disabled={saving} className="w-full">
                          {saving ? 'Saving...' : 'Save Changes'}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}