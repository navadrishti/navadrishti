'use client';

import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { useRouter } from 'next/navigation';
import { toast as sonnerToast } from 'sonner';
import { PencilLine, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
import { formatStatusLabel } from '@/lib/format-date';
import { cn, getErrorMessage } from '@/lib/utils';
import { RequestFullDetails } from './detail-panels';
import { adminListButtonClass, statusTone, textMatch } from './helpers';
import type { AdminServiceRequest, OverviewData } from './types';

const emptyRequestDraft = {
  title: '',
  description: '',
  category: '',
  request_type: '',
  location: '',
  status: '',
  timeline: '',
  estimated_budget: '',
  beneficiary_count: '',
  impact_description: '',
  contact_info: '',
};

const requestStatusOptions = [
  { value: 'active', label: 'Active' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

function requestDraftFrom(request: AdminServiceRequest | null | undefined): typeof emptyRequestDraft {
  return {
    title: request?.title || '',
    description: request?.description || '',
    category: request?.category || '',
    request_type: request?.request_type || '',
    location: request?.location || '',
    status: request?.status || '',
    timeline: request?.timeline || '',
    estimated_budget: request?.estimated_budget?.toString?.() || '',
    beneficiary_count: request?.beneficiary_count?.toString?.() || '',
    impact_description: request?.impact_description || '',
    contact_info: request?.contact_info || '',
  };
}

export function useRequestsPanelState({
  setOverview,
  onDeleted,
}: {
  setOverview: Dispatch<SetStateAction<OverviewData | null>>;
  onDeleted: () => Promise<void>;
}) {
  const [selectedRequest, setSelectedRequest] = useState<AdminServiceRequest | null>(null);
  const [requestDraft, setRequestDraft] = useState(emptyRequestDraft);
  const [savingRequest, setSavingRequest] = useState(false);
  const [deletingRequest, setDeletingRequest] = useState(false);
  const [requestQuery, setRequestQuery] = useState('');

  const selectRequest = async (requestItem: AdminServiceRequest) => {
    setSelectedRequest(requestItem);
    setRequestDraft(requestDraftFrom(requestItem));

    try {
      const response = await fetch(`/api/admin/service-requests/${requestItem.id}`, { credentials: 'include' });
      const data = await response.json();
      if (response.ok && data?.data) {
        const full: AdminServiceRequest = data.data;
        setSelectedRequest(full);
        setRequestDraft(requestDraftFrom(full));
      }
    } catch {
      // keep list snapshot
    }
  };

  const saveRequest = async () => {
    if (!selectedRequest) return;
    try {
      setSavingRequest(true);
      const response = await fetch(`/api/admin/service-requests/${encodeURIComponent(selectedRequest.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestDraft),
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to update request');
      }

      sonnerToast.success('Service request updated');
      setSelectedRequest(data.data);
      setOverview((current) => current ? {
        ...current,
        recent: {
          ...current.recent,
          service_requests: current.recent.service_requests.map((item) => (item.id === data.data.id ? data.data : item)),
        },
      } : current);
    } catch (error) {
      sonnerToast.error(getErrorMessage(error) || 'Failed to update request');
    } finally {
      setSavingRequest(false);
    }
  };

  const deleteRequest = async () => {
    if (!selectedRequest) return;
    if (!window.confirm(`Delete service request ${selectedRequest.id}? This cannot be undone.`)) return;

    try {
      setDeletingRequest(true);
      const response = await fetch(`/api/admin/service-requests/${encodeURIComponent(selectedRequest.id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to delete request');
      }

      sonnerToast.success('Service request deleted');
      setSelectedRequest(null);
      await onDeleted();
    } catch (error) {
      sonnerToast.error(getErrorMessage(error) || 'Failed to delete request');
    } finally {
      setDeletingRequest(false);
    }
  };

  return {
    selectedRequest,
    requestDraft,
    setRequestDraft,
    savingRequest,
    deletingRequest,
    requestQuery,
    setRequestQuery,
    selectRequest,
    saveRequest,
    deleteRequest,
  };
}

export type RequestsPanelState = ReturnType<typeof useRequestsPanelState>;

export function RequestsPanel({ requests, state }: { requests: AdminServiceRequest[]; state: RequestsPanelState }) {
  const router = useRouter();
  const {
    selectedRequest,
    requestDraft,
    setRequestDraft,
    savingRequest,
    deletingRequest,
    requestQuery,
    setRequestQuery,
    selectRequest,
    saveRequest,
    deleteRequest,
  } = state;

  const filteredRequests = useMemo(() => {
    const query = requestQuery.trim();
    if (!query) return requests;
    return requests.filter((item) => (
      textMatch(item.title, query)
      || textMatch(item.description, query)
      || textMatch(item.requester?.name, query)
      || textMatch(item.category, query)
      || textMatch(item.status, query)
      || textMatch(item.location, query)
      || textMatch(item.id, query)
    ));
  }, [requests, requestQuery]);

  return (
    <div className="grid h-full min-h-0 gap-6 overflow-x-hidden overflow-y-auto pr-1 xl:grid-cols-[0.85fr_1.15fr]">
      <Card className="border-blue-100 bg-white text-slate-900 min-w-0">
        <CardHeader>
          <CardTitle className="text-slate-900">All requests</CardTitle>
          <Input
            value={requestQuery}
            onChange={(e) => setRequestQuery(e.target.value)}
            placeholder="Search request by id, title, NGO, status, category"
            className="mt-3 w-full min-w-0 border-blue-200 bg-white text-slate-900 placeholder:text-slate-400"
          />
        </CardHeader>
        <CardContent className="min-w-0 space-y-3 overflow-hidden">
          {filteredRequests.map((requestItem) => (
            <button key={requestItem.id} onClick={() => selectRequest(requestItem)} className={adminListButtonClass(selectedRequest?.id === requestItem.id)}>
              <div className="flex items-start justify-between gap-3 min-w-0">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900 break-words line-clamp-2">{requestItem.title}</p>
                  <p className="text-xs text-slate-500 truncate">{requestItem.requester?.name || 'Unknown NGO'}</p>
                </div>
                <Badge className={cn('shrink-0', statusTone(requestItem.status))}>{formatStatusLabel(requestItem.status || 'unknown')}</Badge>
              </div>
              <p className="mt-2 line-clamp-2 break-all text-sm text-slate-600">{requestItem.description}</p>
            </button>
          ))}
          {filteredRequests.length === 0 ? <p className="text-sm text-slate-500">No requests match your search.</p> : null}
        </CardContent>
      </Card>

      <Card className="min-w-0 border-blue-100 bg-white text-slate-900">
        <CardHeader>
          <CardTitle className="text-slate-900">Request editor</CardTitle>
        </CardHeader>
        <CardContent className="min-w-0 space-y-4 overflow-hidden">
          {!selectedRequest ? (
            <p className="text-sm text-slate-500">Select a request to edit it.</p>
          ) : (
            <>
              <RequestFullDetails request={selectedRequest} />
              <div className="grid gap-3 md:grid-cols-2">
                <Input value={requestDraft.title} onChange={(e) => setRequestDraft((prev) => ({ ...prev, title: e.target.value }))} placeholder="Title" className="border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                <Input value={requestDraft.category} onChange={(e) => setRequestDraft((prev) => ({ ...prev, category: e.target.value }))} placeholder="Project category" className="border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                <Input value={requestDraft.request_type} onChange={(e) => setRequestDraft((prev) => ({ ...prev, request_type: e.target.value }))} placeholder="Request type" className="border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                <Select value={requestDraft.status} onValueChange={(value) => setRequestDraft((prev) => ({ ...prev, status: value }))}>
                  <SelectTrigger className="border-blue-200 bg-white text-slate-900">
                    <SelectValue placeholder="Request status" />
                  </SelectTrigger>
                  <SelectContent>
                    {requestStatusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input value={requestDraft.location} onChange={(e) => setRequestDraft((prev) => ({ ...prev, location: e.target.value }))} placeholder="Location" className="md:col-span-2 border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                <Input value={requestDraft.timeline} onChange={(e) => setRequestDraft((prev) => ({ ...prev, timeline: e.target.value }))} placeholder="Timeline" className="md:col-span-2 border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                <Input value={requestDraft.estimated_budget} onChange={(e) => setRequestDraft((prev) => ({ ...prev, estimated_budget: e.target.value }))} placeholder="Estimated budget" className="border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                <Input value={requestDraft.beneficiary_count} onChange={(e) => setRequestDraft((prev) => ({ ...prev, beneficiary_count: e.target.value }))} placeholder="Beneficiary count" className="border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
              </div>
              <Textarea value={requestDraft.description} onChange={(e) => setRequestDraft((prev) => ({ ...prev, description: e.target.value }))} rows={4} placeholder="Description" className="border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
              <Textarea value={requestDraft.impact_description} onChange={(e) => setRequestDraft((prev) => ({ ...prev, impact_description: e.target.value }))} rows={3} placeholder="Impact description" className="border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
              <Input value={requestDraft.contact_info} onChange={(e) => setRequestDraft((prev) => ({ ...prev, contact_info: e.target.value }))} placeholder="Contact info" className="border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
              <div className="flex flex-wrap gap-3">
                <Button onClick={saveRequest} disabled={savingRequest} className="bg-cyan-600 hover:bg-cyan-500"><PencilLine className="mr-2 h-4 w-4" />{savingRequest ? 'Saving...' : 'Save changes'}</Button>
                <Button onClick={deleteRequest} disabled={deletingRequest} variant="destructive"><Trash2 className="mr-2 h-4 w-4" />{deletingRequest ? 'Deleting...' : 'Delete request'}</Button>
                <Button variant="outline" className="border-gram-border bg-white text-udaan-blue hover:bg-gram-sage" onClick={() => router.push(`/service-requests/${selectedRequest.id}`)}>Open live page</Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
