import { useEffect, useEffectEvent, useState, type Dispatch, type SetStateAction } from 'react';
import { toast as sonnerToast } from 'sonner';
import { getErrorMessage } from '@/lib/utils';
import type {
  DeliveryTrackingSnapshot,
  SupportTicket,
  SupportTicketMessage,
  SupportTicketStatus,
} from './types';

export function useSupportPanelState({
  active,
  setTickets,
}: {
  active: boolean;
  setTickets: Dispatch<SetStateAction<SupportTicket[]>>;
}) {
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportQuery, setSupportQuery] = useState('');
  const [supportStatusFilter, setSupportStatusFilter] = useState<SupportTicketStatus | 'all'>('all');
  const [supportBucketFilter, setSupportBucketFilter] = useState<'open' | 'closed' | 'all'>('open');
  const [selectedTicketDetail, setSelectedTicketDetail] = useState<SupportTicket | null>(null);
  const [viewingSupportProof, setViewingSupportProof] = useState<{ url: string; label: string } | null>(null);
  const [messages, setMessages] = useState<SupportTicketMessage[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [statusUpdate, setStatusUpdate] = useState<SupportTicketStatus>('open');
  const [replyMessage, setReplyMessage] = useState('');
  const [replying, setReplying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [trackingLookupId, setTrackingLookupId] = useState('');
  const [trackingLookupLoading, setTrackingLookupLoading] = useState(false);
  const [trackingSnapshot, setTrackingSnapshot] = useState<DeliveryTrackingSnapshot | null>(null);

  const fetchTickets = async (status?: SupportTicketStatus, q?: string) => {
    try {
      setSupportLoading(true);
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (q) params.set('q', q);
      const response = await fetch(`/api/admin/support-tickets?${params.toString()}`, { credentials: 'include' });
      const data = await response.json();
      if (!response.ok || !data?.success) throw new Error(data?.error || 'Failed to fetch tickets');
      setTickets(Array.isArray(data.tickets) ? data.tickets : []);
    } catch (err) {
      sonnerToast.error(getErrorMessage(err) || 'Failed to load tickets');
      setTickets([]);
    } finally {
      setSupportLoading(false);
    }
  };

  const loadTicketDetails = async (ticketId: string) => {
    try {
      setDetailLoading(true);
      const response = await fetch(`/api/admin/support-tickets/${encodeURIComponent(ticketId)}`, { credentials: 'include' });
      const data = await response.json();
      if (!response.ok || !data?.success) throw new Error(data?.error || 'Failed to load ticket details');
      setSelectedTicketDetail(data.ticket || null);
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      setStatusUpdate((data.ticket?.status || 'open') as SupportTicketStatus);
    } catch (err) {
      sonnerToast.error(getErrorMessage(err) || 'Failed to load ticket');
    } finally {
      setDetailLoading(false);
    }
  };

  const selectTicket = (ticket: SupportTicket) => {
    setSelectedTicketDetail(ticket);
    setViewingSupportProof(null);
    setReplyMessage('');
    setTrackingLookupId('');
    setTrackingSnapshot(null);
    loadTicketDetails(ticket.ticket_id);
  };

  const lookupDeliveryTracking = async () => {
    const trackingId = trackingLookupId.trim();
    if (!trackingId) {
      sonnerToast.error('Tracking ID required');
      return;
    }
    try {
      setTrackingLookupLoading(true);
      const response = await fetch('/api/admin/delivery/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ trackingId }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) throw new Error(data?.error || 'Failed to fetch tracking');
      setTrackingSnapshot(data.data || null);
      sonnerToast.success('Tracking synced');
    } catch (err) {
      sonnerToast.error(getErrorMessage(err) || 'Tracking lookup failed');
      setTrackingSnapshot(null);
    } finally {
      setTrackingLookupLoading(false);
    }
  };

  const sendReply = async () => {
    if (!selectedTicketDetail || !replyMessage.trim()) {
      sonnerToast.error('Reply message required');
      return;
    }
    try {
      setReplying(true);
      const response = await fetch(`/api/admin/support-tickets/${encodeURIComponent(selectedTicketDetail.ticket_id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: statusUpdate, reply_message: replyMessage }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) throw new Error(data?.error || 'Failed to send reply');
      sonnerToast.success('Reply sent');
      setSelectedTicketDetail(data.ticket || null);
      setTickets((prev) => prev.map((t) => (t.ticket_id === data.ticket.ticket_id ? data.ticket : t)));
      setReplyMessage('');
      await loadTicketDetails(selectedTicketDetail.ticket_id);
    } catch (err) {
      sonnerToast.error(getErrorMessage(err) || 'Reply failed');
    } finally {
      setReplying(false);
    }
  };

  const updateSelectedTicket = async () => {
    if (!selectedTicketDetail) return;
    try {
      setSaving(true);
      const response = await fetch(`/api/admin/support-tickets/${encodeURIComponent(selectedTicketDetail.ticket_id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: statusUpdate }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success) throw new Error(data?.error || 'Failed to update ticket');
      sonnerToast.success('Ticket updated');
      setSelectedTicketDetail(data.ticket || null);
      setTickets((prev) => prev.map((t) => (t.ticket_id === data.ticket.ticket_id ? data.ticket : t)));
      await loadTicketDetails(selectedTicketDetail.ticket_id);
    } catch (err) {
      sonnerToast.error(getErrorMessage(err) || 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const fetchTicketsForFilters = useEffectEvent(fetchTickets);

  useEffect(() => {
    if (!active) return;
    const delay = supportQuery.trim() ? 300 : 0;
    const timer = window.setTimeout(() => {
      fetchTicketsForFilters(
        supportStatusFilter === 'all' ? undefined : supportStatusFilter,
        supportQuery.trim() || undefined
      );
    }, delay);
    return () => window.clearTimeout(timer);
  }, [active, supportStatusFilter, supportQuery]);

  return {
    supportLoading,
    supportQuery,
    setSupportQuery,
    supportStatusFilter,
    setSupportStatusFilter,
    supportBucketFilter,
    setSupportBucketFilter,
    selectedTicketDetail,
    viewingSupportProof,
    setViewingSupportProof,
    messages,
    detailLoading,
    statusUpdate,
    setStatusUpdate,
    replyMessage,
    setReplyMessage,
    replying,
    saving,
    trackingLookupId,
    setTrackingLookupId,
    trackingLookupLoading,
    trackingSnapshot,
    fetchTickets,
    selectTicket,
    lookupDeliveryTracking,
    sendReply,
    updateSelectedTicket,
  };
}

export type SupportPanelState = ReturnType<typeof useSupportPanelState>;
