'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/lib/utils';
import { filterTickets } from './helpers';
import type { SupportMessage, SupportTicket, TicketBucket, TicketStatus, ViewingDocument } from './types';

export function useSupportTickets(token: string | null | undefined, inboxActive: boolean) {
  const { toast } = useToast();

  const [ticketBucket, setTicketBucket] = useState<TicketBucket>('open');
  const [ticketStatusFilter, setTicketStatusFilter] = useState<TicketStatus | 'all'>('all');
  const [ticketQuery, setTicketQuery] = useState('');
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [viewingDoc, setViewingDoc] = useState<ViewingDocument | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replyMessage, setReplyMessage] = useState('');
  const [replying, setReplying] = useState(false);

  const visibleTickets = useMemo(
    () => filterTickets(tickets, ticketBucket, ticketStatusFilter, ticketQuery),
    [ticketBucket, ticketStatusFilter, ticketQuery, tickets]
  );

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
    } catch (error) {
      toast({ title: 'Could not load tickets', description: getErrorMessage(error) || 'Please try again.', variant: 'destructive' });
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
    } catch (error) {
      toast({ title: 'Could not load ticket', description: getErrorMessage(error) || 'Please try again.', variant: 'destructive' });
    } finally {
      setDetailLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    if (token && inboxActive) {
      loadTickets();
    }
  }, [token, inboxActive, loadTickets]);

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
    } catch (error) {
      toast({ title: 'Send failed', description: getErrorMessage(error) || 'Could not send your message.', variant: 'destructive' });
    } finally {
      setReplying(false);
    }
  };

  return {
    ticketBucket,
    setTicketBucket,
    ticketStatusFilter,
    setTicketStatusFilter,
    ticketQuery,
    setTicketQuery,
    visibleTickets,
    inboxLoading,
    loadTickets,
    selectedTicketId,
    setSelectedTicketId,
    selectedTicket,
    messages,
    detailLoading,
    viewingDoc,
    setViewingDoc,
    selectTicket,
    replyMessage,
    setReplyMessage,
    replying,
    sendReply,
  };
}

export type SupportTicketsState = ReturnType<typeof useSupportTickets>;
