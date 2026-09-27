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
import { CampaignFullDetails } from './detail-panels';
import { adminListButtonClass, statusTone, textMatch } from './helpers';
import type { AdminCampaign } from './types';

const emptyCampaignDraft = {
  title: '',
  description: '',
  category: '',
  location: '',
  schedule_vii: '',
  status: '',
  budget_inr: '',
  start_date: '',
  end_date: '',
  volunteer_requirement: '',
  impact_metrics: '',
  milestones: '',
};

const campaignStatusOptions = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'closed', label: 'Closed' },
];

export function useCampaignsPanelState({
  setCampaigns,
  onDeleted,
}: {
  setCampaigns: Dispatch<SetStateAction<AdminCampaign[]>>;
  onDeleted: () => Promise<void>;
}) {
  const [selectedCampaign, setSelectedCampaign] = useState<AdminCampaign | null>(null);
  const [campaignDraft, setCampaignDraft] = useState(emptyCampaignDraft);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [deletingCampaign, setDeletingCampaign] = useState(false);
  const [campaignQuery, setCampaignQuery] = useState('');

  const selectCampaign = (campaignItem: AdminCampaign) => {
    setSelectedCampaign(campaignItem);
    const impactMetrics: Record<string, unknown> = campaignItem?.impact_metrics && typeof campaignItem.impact_metrics === 'object'
      ? campaignItem.impact_metrics as Record<string, unknown>
      : {};
    setCampaignDraft({
      title: campaignItem?.title || '',
      description: campaignItem?.description || '',
      category: campaignItem?.category || campaignItem?.cause || '',
      location: campaignItem?.location || campaignItem?.region || '',
      schedule_vii: campaignItem?.schedule_vii || '',
      status: campaignItem?.status || 'draft',
      budget_inr: campaignItem?.budget_inr?.toString?.() || '',
      start_date: campaignItem?.start_date || '',
      end_date: campaignItem?.end_date || '',
      volunteer_requirement: String(impactMetrics?.volunteer_requirement || ''),
      impact_metrics: JSON.stringify(impactMetrics, null, 2),
      milestones: JSON.stringify(Array.isArray(campaignItem?.milestones) ? campaignItem.milestones : [], null, 2),
    });
  };

  const saveCampaign = async () => {
    if (!selectedCampaign) return;

    try {
      setSavingCampaign(true);
      const response = await fetch(`/api/admin/campaigns/${encodeURIComponent(selectedCampaign.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: campaignDraft.title,
          description: campaignDraft.description,
          category: campaignDraft.category,
          location: campaignDraft.location,
          schedule_vii: campaignDraft.schedule_vii,
          status: campaignDraft.status,
          budget_inr: campaignDraft.budget_inr,
          start_date: campaignDraft.start_date,
          end_date: campaignDraft.end_date,
          volunteer_requirement: campaignDraft.volunteer_requirement,
          impact_metrics: campaignDraft.impact_metrics,
          milestones: campaignDraft.milestones,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to update campaign');
      }

      sonnerToast.success('CSR campaign updated');
      setSelectedCampaign(data.data);
      setCampaigns((current) => current.map((item) => (item.id === data.data.id ? data.data : item)));
    } catch (error) {
      sonnerToast.error(getErrorMessage(error) || 'Failed to update campaign');
    } finally {
      setSavingCampaign(false);
    }
  };

  const deleteCampaign = async () => {
    if (!selectedCampaign) return;
    if (!window.confirm(`Delete CSR campaign "${selectedCampaign.title || selectedCampaign.id}"? This cannot be undone.`)) return;

    try {
      setDeletingCampaign(true);
      const response = await fetch(`/api/admin/campaigns/${encodeURIComponent(selectedCampaign.id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to delete campaign');
      }

      sonnerToast.success('CSR campaign deleted');
      setSelectedCampaign(null);
      await onDeleted();
    } catch (error) {
      sonnerToast.error(getErrorMessage(error) || 'Failed to delete campaign');
    } finally {
      setDeletingCampaign(false);
    }
  };

  return {
    selectedCampaign,
    campaignDraft,
    setCampaignDraft,
    savingCampaign,
    deletingCampaign,
    campaignQuery,
    setCampaignQuery,
    selectCampaign,
    saveCampaign,
    deleteCampaign,
  };
}

export type CampaignsPanelState = ReturnType<typeof useCampaignsPanelState>;

export function CampaignsPanel({ campaigns, state }: { campaigns: AdminCampaign[]; state: CampaignsPanelState }) {
  const router = useRouter();
  const {
    selectedCampaign,
    campaignDraft,
    setCampaignDraft,
    savingCampaign,
    deletingCampaign,
    campaignQuery,
    setCampaignQuery,
    selectCampaign,
    saveCampaign,
    deleteCampaign,
  } = state;

  const filteredCampaigns = useMemo(() => {
    const query = campaignQuery.trim();
    if (!query) return campaigns;
    return campaigns.filter((item) => (
      textMatch(item.title, query)
      || textMatch(item.description, query)
      || textMatch(item.category, query)
      || textMatch(item.location, query)
      || textMatch(item.schedule_vii, query)
      || textMatch(item.status, query)
      || textMatch(item.company?.name, query)
      || textMatch(item.id, query)
    ));
  }, [campaigns, campaignQuery]);

  return (
    <div className="grid h-full min-h-0 gap-6 overflow-x-hidden pr-1 xl:grid-cols-[0.85fr_1.15fr]">
      <Card className="min-w-0 border-blue-100 bg-white text-slate-900">
        <CardHeader>
          <CardTitle className="text-slate-900">All CSR campaigns</CardTitle>
          <Input
            value={campaignQuery}
            onChange={(e) => setCampaignQuery(e.target.value)}
            placeholder="Search by title, company, category, location, status"
            className="mt-3 border-blue-200 bg-white text-slate-900 placeholder:text-slate-400"
          />
        </CardHeader>
        <CardContent className="min-w-0 space-y-3 overflow-hidden">
          {filteredCampaigns.map((campaignItem) => (
            <button
              key={campaignItem.id}
              onClick={() => selectCampaign(campaignItem)}
              className={adminListButtonClass(selectedCampaign?.id === campaignItem.id)}
            >
              <div className="flex items-start justify-between gap-3 min-w-0">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900 break-words line-clamp-2">{campaignItem.title || 'Untitled campaign'}</p>
                  <p className="text-xs text-slate-500 truncate">{campaignItem.company?.name || `Company #${campaignItem.company_id || '?'}`}</p>
                </div>
                <Badge className={cn('shrink-0', statusTone(campaignItem.status))}>{formatStatusLabel(campaignItem.status || 'draft')}</Badge>
              </div>
              <p className="mt-2 line-clamp-2 break-all text-sm text-slate-600">{campaignItem.description || campaignItem.category || 'No description'}</p>
            </button>
          ))}
          {filteredCampaigns.length === 0 ? <p className="text-sm text-slate-500">No CSR campaigns match your search.</p> : null}
        </CardContent>
      </Card>

      <Card className="border-blue-100 bg-white text-slate-900">
        <CardHeader>
          <CardTitle className="text-slate-900">Campaign editor</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selectedCampaign ? (
            <p className="text-sm text-slate-500">Select a CSR campaign to edit or delete it.</p>
          ) : (
            <>
              <CampaignFullDetails campaign={selectedCampaign} />
              <div className="grid gap-3 md:grid-cols-2">
                <Input value={campaignDraft.title} onChange={(e) => setCampaignDraft((prev) => ({ ...prev, title: e.target.value }))} placeholder="Title" className="md:col-span-2 border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                <Input value={campaignDraft.category} onChange={(e) => setCampaignDraft((prev) => ({ ...prev, category: e.target.value }))} placeholder="Category" className="border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                <Input value={campaignDraft.schedule_vii} onChange={(e) => setCampaignDraft((prev) => ({ ...prev, schedule_vii: e.target.value }))} placeholder="Schedule VII" className="border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                <Select value={campaignDraft.status} onValueChange={(value) => setCampaignDraft((prev) => ({ ...prev, status: value }))}>
                  <SelectTrigger className="border-blue-200 bg-white text-slate-900">
                    <SelectValue placeholder="Campaign status" />
                  </SelectTrigger>
                  <SelectContent>
                    {campaignStatusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input value={campaignDraft.budget_inr} onChange={(e) => setCampaignDraft((prev) => ({ ...prev, budget_inr: e.target.value }))} placeholder="Budget (INR)" className="border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                <Input value={campaignDraft.volunteer_requirement} onChange={(e) => setCampaignDraft((prev) => ({ ...prev, volunteer_requirement: e.target.value }))} placeholder="Volunteer requirement" className="border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                <Input value={campaignDraft.location} onChange={(e) => setCampaignDraft((prev) => ({ ...prev, location: e.target.value }))} placeholder="Location" className="md:col-span-2 border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                <Input value={campaignDraft.start_date} onChange={(e) => setCampaignDraft((prev) => ({ ...prev, start_date: e.target.value }))} placeholder="Start date (YYYY-MM-DD)" className="border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
                <Input value={campaignDraft.end_date} onChange={(e) => setCampaignDraft((prev) => ({ ...prev, end_date: e.target.value }))} placeholder="End date (YYYY-MM-DD)" className="border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
              </div>
              <Textarea value={campaignDraft.description} onChange={(e) => setCampaignDraft((prev) => ({ ...prev, description: e.target.value }))} rows={4} placeholder="Description" className="border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
              <Textarea value={campaignDraft.impact_metrics} onChange={(e) => setCampaignDraft((prev) => ({ ...prev, impact_metrics: e.target.value }))} rows={6} placeholder="Impact metrics (JSON)" className="font-mono text-xs border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
              <Textarea value={campaignDraft.milestones} onChange={(e) => setCampaignDraft((prev) => ({ ...prev, milestones: e.target.value }))} rows={6} placeholder="Milestones (JSON)" className="font-mono text-xs border-blue-200 bg-white text-slate-900 placeholder:text-slate-400" />
              <div className="flex flex-wrap gap-3">
                <Button onClick={saveCampaign} disabled={savingCampaign} className="bg-cyan-600 hover:bg-cyan-500"><PencilLine className="mr-2 h-4 w-4" />{savingCampaign ? 'Saving...' : 'Save changes'}</Button>
                <Button onClick={deleteCampaign} disabled={deletingCampaign} variant="destructive"><Trash2 className="mr-2 h-4 w-4" />{deletingCampaign ? 'Deleting...' : 'Delete campaign'}</Button>
                <Button variant="outline" className="border-gram-border bg-white text-udaan-blue hover:bg-gram-sage" onClick={() => router.push(`/csr-campaigns/${selectedCampaign.id}`)}>Open live page</Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
