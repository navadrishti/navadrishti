'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DocumentFileViewer } from '@/components/ca-verification-review';
import { AdminTicketDetailSkeleton } from '@/components/evidence-verification/portal-ui';
import { formatStatusLabel } from '@/lib/format-date';
import { SupportStatusTag, TicketFullDetails } from './detail-panels';
import type { SupportPanelState } from './support-state';
import type { SupportTicketStatus } from './types';

export function SupportTicketDetailCard({ state }: { state: SupportPanelState }) {
  const {
    selectedTicketDetail,
    detailLoading,
    viewingSupportProof,
    setViewingSupportProof,
    messages,
    replyMessage,
    setReplyMessage,
    replying,
    sendReply,
    trackingLookupId,
    setTrackingLookupId,
    trackingLookupLoading,
    trackingSnapshot,
    lookupDeliveryTracking,
    statusUpdate,
    setStatusUpdate,
    saving,
    updateSelectedTicket,
  } = state;

  return (
    <Card className="flex min-h-[36rem] flex-col border-udaan-blue/15 bg-white">
      <CardHeader className="border-b border-slate-100 pb-4">
        <CardTitle className="text-slate-900">Ticket Details</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col pt-6">
        {!selectedTicketDetail ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-sm text-slate-600">
            Select a ticket to review the issue, proof, and resolution controls.
          </div>
        ) : detailLoading ? (
          <AdminTicketDetailSkeleton />
        ) : viewingSupportProof ? (
          <DocumentFileViewer
            url={viewingSupportProof.url}
            label={viewingSupportProof.label}
            onBack={() => setViewingSupportProof(null)}
          />
        ) : (
          <div className="flex-1 space-y-5 overflow-y-auto pr-1">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-slate-500">Ticket ID</p>
                <p className="text-lg font-semibold">{selectedTicketDetail.ticket_id}</p>
              </div>
              <SupportStatusTag status={selectedTicketDetail.status} />
            </div>

            <div className="grid gap-4 md:grid-cols-2 text-sm">
              <div>
                <p className="text-slate-500">Raised By</p>
                <p className="font-medium">{selectedTicketDetail.user_name || selectedTicketDetail.user?.name || 'Unknown'}</p>
                <p className="text-slate-500">{selectedTicketDetail.user_email || selectedTicketDetail.user?.email || 'No email'}</p>
              </div>
              <div>
                <p className="text-slate-500">User Type</p>
                <p className="font-medium capitalize">{selectedTicketDetail.user_type || selectedTicketDetail.user?.user_type || 'Unknown'}</p>
                <p className="text-slate-500">Created {new Date(selectedTicketDetail.created_at).toLocaleString('en-IN', { timeZone: 'UTC' })}</p>
              </div>
            </div>

            <TicketFullDetails
              ticket={selectedTicketDetail}
              onViewProof={(url) =>
                setViewingSupportProof({
                  url,
                  label: `Proof · ${selectedTicketDetail.ticket_id}`,
                })
              }
            />

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-500">Messages</p>
              {messages.length === 0 ? (
                <p className="text-sm text-slate-500">No messages yet.</p>
              ) : (
                <div className="space-y-3 rounded-lg border bg-slate-50 p-4">
                  {messages.map((message) => {
                    const ticketUserName =
                      selectedTicketDetail.user_name
                      || selectedTicketDetail.user?.name
                      || 'User';
                    const senderLabel =
                      message.sender_type === 'admin'
                        ? 'Administrator'
                        : ticketUserName;

                    return (
                    <div key={message.id} className={`rounded-lg border p-3 text-sm ${message.sender_type === 'admin' ? 'bg-udaan-blue/5 border-udaan-blue/20' : 'bg-white'}`}>
                      <div className="mb-1 flex items-center justify-between gap-2 text-xs text-slate-500">
                        <span className="min-w-0 max-w-[70%] truncate font-medium text-slate-700" title={senderLabel}>
                          {senderLabel}
                        </span>
                        <span className="shrink-0">{new Date(message.created_at).toLocaleString('en-IN', { timeZone: 'UTC' })}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-slate-800">{message.content}</p>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-2 rounded-lg border bg-white p-4">
              <p className="text-sm font-semibold text-slate-900">Reply to User</p>
              <Textarea value={replyMessage} onChange={(e) => setReplyMessage(e.target.value)} rows={4} placeholder="Write the message the user should receive" />
              <Button onClick={sendReply} disabled={replying} className="h-10 w-full bg-udaan-blue text-white hover:bg-udaan-blue/90">
                {replying ? 'Sending...' : 'Send Reply'}
              </Button>
            </div>

            <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-slate-900">Delhivery Tracking Lookup</p>
              <p className="text-xs text-slate-600">Use this to fetch live shipment status for donor-to-NGO deliveries.</p>
              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <Input value={trackingLookupId} onChange={(e) => setTrackingLookupId(e.target.value)} placeholder="Enter Delhivery tracking ID" className="border-slate-200 bg-white" />
                <Button onClick={lookupDeliveryTracking} disabled={trackingLookupLoading} className="bg-udaan-blue text-white hover:bg-udaan-blue/90">{trackingLookupLoading ? 'Checking...' : 'Track Shipment'}</Button>
              </div>

              {trackingSnapshot ? (
                <div className="space-y-2 rounded-md border border-slate-200 bg-white p-3 text-sm">
                  <p><span className="font-medium text-gray-600">Provider:</span> {trackingSnapshot.provider || 'delhivery'}</p>
                  <p><span className="font-medium text-gray-600">Tracking ID:</span> {trackingSnapshot.trackingId || 'N/A'}</p>
                  <p><span className="font-medium text-gray-600">Current Status:</span> {trackingSnapshot.currentStatus || 'N/A'}</p>
                  <p><span className="font-medium text-gray-600">Last Location:</span> {trackingSnapshot.lastLocation || 'N/A'}</p>
                  <p><span className="font-medium text-gray-600">Last Event:</span> {trackingSnapshot.lastEventAt ? new Date(trackingSnapshot.lastEventAt).toLocaleString('en-IN', { timeZone: 'UTC' }) : 'N/A'}</p>
                  {Array.isArray(trackingSnapshot.events) && trackingSnapshot.events.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      <p className="font-medium text-gray-700">Recent Events</p>
                      <div className="max-h-48 space-y-2 overflow-auto pr-1">
                        {trackingSnapshot.events.slice(0, 6).map((event, index) => (
                          <div key={`${event.timestamp || 'event'}-${index}`} className="rounded border border-slate-200 bg-white p-2 text-xs">
                            <p className="font-medium text-slate-800">{formatStatusLabel(event.status || 'update')}</p>
                            <p className="text-slate-600">{event.location || 'Unknown location'}</p>
                            <p className="text-slate-500">{event.timestamp ? new Date(event.timestamp).toLocaleString('en-IN', { timeZone: 'UTC' }) : 'Unknown time'}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-500">Update Status</p>
                <Select
                  value={statusUpdate}
                  onValueChange={(value) => setStatusUpdate(value as SupportTicketStatus)}
                >
                  <SelectTrigger className="h-10 border-blue-200 bg-white text-slate-900">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent className="border-blue-100 bg-white">
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={updateSelectedTicket} disabled={saving} className="h-10 w-full bg-udaan-blue text-white hover:bg-udaan-blue/90">
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
