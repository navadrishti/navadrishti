'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DocumentFileViewer } from '@/components/ca-verification-review';
import { formatStatusLabel } from '@/lib/format-date';
import { cn } from '@/lib/utils';
import { statusTone } from './helpers';
import type { SupportMessage, SupportTicket, ViewingDocument } from './types';
import type { SupportTicketsState } from './use-support-tickets';

function TicketMessages({
  messages,
  onViewAttachment,
}: {
  messages: SupportMessage[];
  onViewAttachment: (doc: ViewingDocument) => void;
}) {
  if (messages.length === 0) {
    return <p className="text-sm text-slate-500">No messages yet.</p>;
  }

  return (
    <div className="max-h-80 space-y-3 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-4">
      {messages.map((message) => {
        const attachmentUrl = message.attachment_url;
        return (
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
            {attachmentUrl ? (
              <button
                type="button"
                onClick={() => onViewAttachment({ url: attachmentUrl, label: 'Attachment' })}
                className="mt-2 inline-block text-xs text-udaan-blue"
              >
                View attachment
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function TicketDetailBody({ ticket, inbox }: { ticket: SupportTicket; inbox: SupportTicketsState }) {
  const { messages, setViewingDoc, replyMessage, setReplyMessage, replying, sendReply } = inbox;
  const proofUrl = ticket.proof_url;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">Ticket ID</p>
          <p className="text-lg font-semibold text-slate-900">{ticket.ticket_id}</p>
        </div>
        <span className={cn('rounded-full border px-2.5 py-0.5 text-xs font-semibold', statusTone(ticket.status))}>
          {formatStatusLabel(ticket.status)}
        </span>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-500">Title</p>
        <p className="rounded-md border border-slate-200 bg-white p-3 text-sm">{ticket.title}</p>
      </div>

      {proofUrl ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-500">Proof</p>
          <button
            type="button"
            onClick={() => setViewingDoc({ url: proofUrl, label: `Proof · ${ticket.ticket_id}` })}
            className="inline-flex rounded-md border border-slate-200 px-3 py-2 text-sm text-udaan-blue"
          >
            Open attached proof
          </button>
        </div>
      ) : null}

      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-500">Messages</p>
        <TicketMessages messages={messages} onViewAttachment={setViewingDoc} />
      </div>

      {ticket.status === 'closed' ? (
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
  );
}

export function TicketDetailCard({ inbox }: { inbox: SupportTicketsState }) {
  const { selectedTicketId, selectedTicket, detailLoading, viewingDoc, setViewingDoc } = inbox;

  return (
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
          <TicketDetailBody ticket={selectedTicket} inbox={inbox} />
        )}
      </CardContent>
    </Card>
  );
}
