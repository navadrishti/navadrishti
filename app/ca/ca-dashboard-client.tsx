'use client';

import { useEffect, useEffectEvent, useState, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, Search } from 'lucide-react';
import { CaQueueAccountTitle, CaQueueStatusBadge } from '@/components/ca-queue-status';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { CAVerificationReview, caReviewDescription, isCaReviewLocked, type CAReviewItem } from '@/components/ca-verification-review';
import { sanitizeCaReviewItem } from '@/lib/ca-review/pack-visibility';
import { CAReviewHistoryFeed } from '@/components/ca-review-history-feed';
import type { CAReviewHistoryEntry } from '@/lib/ca-review/history-types';
import { getErrorMessage } from '@/lib/utils';
import { toast } from 'sonner';

interface Individual {
  id: number;
  name: string;
  email: string;
  profession: string;
  verification_status: string;
  reverification_pending?: boolean;
  ca_badge_number?: string | null;
}

interface Company {
  id: number;
  company_name: string;
  email: string;
  business_description: string;
  verification_status: string;
  reverification_pending?: boolean;
  ca_badge_number?: string | null;
}

interface NGO {
  id: number;
  ngo_name: string;
  email: string;
  ngo_description: string;
  verification_status: string;
  reverification_pending?: boolean;
  ca_badge_number?: string | null;
}

type FilterStatus = 'all' | 'pending' | 'verified' | 'history';

const TABS: { label: string; value: FilterStatus }[] = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Verified', value: 'verified' },
  { label: 'History', value: 'history' },
];

const QUEUE_ITEM_HEIGHT = 'h-[6.5rem]';
const QUEUE_LIST_HEIGHT = 'h-[20.5rem]';
const QUEUE_ITEM_CLASS =
  `${QUEUE_ITEM_HEIGHT} shrink-0 cursor-pointer overflow-hidden rounded-lg border border-slate-100 bg-white p-3`;

function ColumnCard({
  title,
  count,
  href,
  loading,
  children,
}: {
  title: string;
  count: number;
  href: string;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-gram-ink">
          {title}
          <span className="ml-auto text-xs font-normal text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">
            {count}
          </span>
        </CardTitle>
        <p className="text-xs text-slate-400">Scroll to see all results</p>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col px-4 pb-2">
        <div className={`${QUEUE_LIST_HEIGHT} space-y-2 overflow-y-auto overflow-x-hidden pr-1`}>
          {loading
            ? [1, 2, 3].map(i => <Skeleton key={i} className={`${QUEUE_ITEM_HEIGHT} rounded-lg`} />)
            : children}
        </div>
      </CardContent>

      <div className="relative z-10 px-4 pb-4 pt-2 border-t border-slate-100">
        <Button
          asChild
          variant="outline"
          size="sm"
          className="h-9 w-full border-udaan-orange text-udaan-orange hover:bg-orange-50 hover:text-udaan-orange"
        >
          <Link href={href}>
            See full list
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </Card>
  );
}

export default function CADashboardClient() {
  const [individuals, setIndividuals] = useState<Individual[]>([]);
  const [companies, setCompanies]     = useState<Company[]>([]);
  const [ngos, setNGOs]               = useState<NGO[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [history, setHistory] = useState<CAReviewHistoryEntry[]>([]);
  const [searchQuery, setSearchQuery]   = useState('');
  const [selectedItem, setSelectedItem] = useState<CAReviewItem | null>(null);
  const [selectedType, setSelectedType] = useState<'individuals' | 'companies' | 'ngos' | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [complianceTags, setComplianceTags] = useState<string[]>([]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError('');

      if (filterStatus === 'history') {
        const response = await fetch('/api/ca/history', { credentials: 'include' });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || 'Failed to load review history');
        }
        setHistory(Array.isArray(payload.data) ? payload.data : []);
        return;
      }

      const response = await fetch(`/api/ca/queue?status=${filterStatus}`, { credentials: 'include' });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load verification queue');
      }

      setIndividuals((payload.individuals || []).map(sanitizeCaReviewItem));
      setCompanies((payload.companies || []).map(sanitizeCaReviewItem));
      setNGOs((payload.ngos || []).map(sanitizeCaReviewItem));
    } catch (err) {
      setError(getErrorMessage(err) || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const fetchDataForFilter = useEffectEvent(fetchData);

  useEffect(() => {
    fetchDataForFilter();
  }, [filterStatus]);

  const q = searchQuery.toLowerCase();

  const filteredIndividuals = useMemo(() =>
    individuals.filter(ind =>
      !q ||
      ind.name.toLowerCase().includes(q) ||
      ind.email.toLowerCase().includes(q)
    ), [individuals, q]);

  const filteredCompanies = useMemo(() =>
    companies.filter(comp =>
      !q ||
      comp.company_name.toLowerCase().includes(q) ||
      comp.email.toLowerCase().includes(q) ||
      comp.business_description.toLowerCase().includes(q)
    ), [companies, q]);

  const filteredNGOs = useMemo(() =>
    ngos.filter(ngo =>
      !q ||
      ngo.ngo_name.toLowerCase().includes(q) ||
      ngo.email.toLowerCase().includes(q) ||
      ngo.ngo_description.toLowerCase().includes(q)
    ), [ngos, q]);

  const filteredHistory = useMemo(() =>
    history.filter((entry) =>
      !q ||
      entry.stakeholder_name.toLowerCase().includes(q) ||
      entry.kind.toLowerCase().includes(q) ||
      entry.action.toLowerCase().includes(q)
    ), [history, q]);

  const handleItemClick = async (item: CAReviewItem, type: 'individuals' | 'companies' | 'ngos') => {
    const safeItem = sanitizeCaReviewItem(item);
    setSelectedItem(safeItem);
    setSelectedType(type);
    setRejectionReason('');
    setComplianceTags(
      isCaReviewLocked(safeItem) && Array.isArray(safeItem.allotted_compliance_tags)
        ? safeItem.allotted_compliance_tags
        : []
    );
    setReviewLoading(true);
    try {
      const response = await fetch(`/api/ca/review?type=${type}&id=${item.id}`, { credentials: 'include' });
      const data = await response.json();
      if (response.ok && data.data) {
        const review = sanitizeCaReviewItem(data.data as CAReviewItem);
        setSelectedItem(review);
        setComplianceTags(
          isCaReviewLocked(review) && Array.isArray(review.allotted_compliance_tags)
            ? review.allotted_compliance_tags
            : []
        );
      }
    } catch (error) {
      console.error('Failed to load review details:', error);
    } finally {
      setReviewLoading(false);
    }
  };

  const handleAction = async (action: 'approve' | 'reject') => {
    if (!selectedItem || !selectedType) return;
    if (isCaReviewLocked(selectedItem)) return;

    if (action === 'reject' && !rejectionReason.trim()) {
      toast.error('Please provide a reason for rejection');
      return;
    }

    setActionLoading(true);
    try {
      const response = await fetch('/api/ca/verification-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          entity_type: selectedType,
          entity_id: selectedItem.id,
          action: action === 'approve' ? 'approve' : 'reject',
          reason: rejectionReason,
          compliance_tags: selectedType === 'ngos' ? complianceTags : undefined,
        })
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        toast.success(data.message || `${selectedItem.name || selectedItem.company_name || selectedItem.ngo_name} ${action === 'approve' ? 'approved' : 'rejected'}`);
        if (selectedType === 'individuals') {
          setIndividuals(individuals.filter(ind => ind.id !== selectedItem.id));
        } else if (selectedType === 'companies') {
          setCompanies(companies.filter(comp => comp.id !== selectedItem.id));
        } else {
          setNGOs(ngos.filter(ngo => ngo.id !== selectedItem.id));
        }
        setSelectedItem(null);
        setSelectedType(null);
        setRejectionReason('');
        setComplianceTags([]);
      } else {
        toast.error(data.error || 'Failed to process action');
      }
    } catch (error) {
      console.error('Action failed:', error);
      toast.error('Failed to process action');
    } finally {
      setActionLoading(false);
    }
  };

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-6">
          <p className="text-red-700">{error}</p>
          <Button onClick={fetchData} className="mt-4">Retry</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">CA Portal</h1>
        <p className="mt-1 text-slate-500">Review pending submissions. Verified and unverified accounts are view-only.</p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by name, email, or description…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Pill tabs */}
        <div className="flex bg-slate-100 rounded-lg p-1 gap-1 self-start sm:self-auto">
          {TABS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setFilterStatus(value)}
              className={[
                'px-4 py-1.5 rounded-md text-sm font-medium transition-all',
                filterStatus === value
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {filterStatus === 'history' ? (
        <CAReviewHistoryFeed entries={filteredHistory} loading={loading} />
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Individuals */}
        <ColumnCard
          title="Individuals"
          count={filteredIndividuals.length}
          href={filterStatus === 'all' ? '/ca/individuals' : `/ca/individuals?status=${filterStatus}`}
          loading={loading}
        >
          {filteredIndividuals.length === 0 ? (
            <p className="text-sm text-slate-400 py-3">No individuals found</p>
          ) : filteredIndividuals.map(ind => (
            <div
              key={ind.id}
              role="button"
              tabIndex={0}
              className={QUEUE_ITEM_CLASS}
              onClick={() => handleItemClick(ind, 'individuals')}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  handleItemClick(ind, 'individuals')
                }
              }}
            >
              <CaQueueAccountTitle name={ind.name} status={ind.verification_status} badgeNumber={ind.ca_badge_number} />
              <p className="truncate text-xs text-slate-400">{ind.email}</p>
              <div className="mt-2"><CaQueueStatusBadge status={ind.verification_status} reverification={ind.reverification_pending} /></div>
            </div>
          ))}
        </ColumnCard>

        {/* Companies */}
        <ColumnCard
          title="Companies"
          count={filteredCompanies.length}
          href={filterStatus === 'all' ? '/ca/companies' : `/ca/companies?status=${filterStatus}`}
          loading={loading}
        >
          {filteredCompanies.length === 0 ? (
            <p className="text-sm text-slate-400 py-3">No companies found</p>
          ) : filteredCompanies.map(comp => (
            <div
              key={comp.id}
              role="button"
              tabIndex={0}
              className={QUEUE_ITEM_CLASS}
              onClick={() => handleItemClick(comp, 'companies')}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  handleItemClick(comp, 'companies')
                }
              }}
            >
              <CaQueueAccountTitle name={comp.company_name} status={comp.verification_status} badgeNumber={comp.ca_badge_number} />
              <p className="truncate text-xs text-slate-500">{comp.business_description}</p>
              <p className="truncate text-xs text-slate-400">{comp.email}</p>
              <div className="mt-2"><CaQueueStatusBadge status={comp.verification_status} reverification={comp.reverification_pending} /></div>
            </div>
          ))}
        </ColumnCard>

        {/* NGOs */}
        <ColumnCard
          title="NGOs"
          count={filteredNGOs.length}
          href={filterStatus === 'all' ? '/ca/ngos' : `/ca/ngos?status=${filterStatus}`}
          loading={loading}
        >
          {filteredNGOs.length === 0 ? (
            <p className="text-sm text-slate-400 py-3">No NGOs found</p>
          ) : filteredNGOs.map(ngo => (
            <div
              key={ngo.id}
              role="button"
              tabIndex={0}
              className={QUEUE_ITEM_CLASS}
              onClick={() => handleItemClick(ngo, 'ngos')}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  handleItemClick(ngo, 'ngos')
                }
              }}
            >
              <CaQueueAccountTitle name={ngo.ngo_name} status={ngo.verification_status} badgeNumber={ngo.ca_badge_number} />
              <p className="truncate text-xs text-slate-500">{ngo.ngo_description}</p>
              <p className="truncate text-xs text-slate-400">{ngo.email}</p>
              <div className="mt-2"><CaQueueStatusBadge status={ngo.verification_status} reverification={ngo.reverification_pending} /></div>
            </div>
          ))}
        </ColumnCard>
      </div>
      )}

      {/* Item Details Dialog */}
      <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedItem ? (
                <CaQueueAccountTitle
                  name={
                    selectedType === 'companies'
                      ? selectedItem.company_name || 'Company'
                      : selectedType === 'ngos'
                        ? selectedItem.ngo_name || 'NGO'
                        : selectedItem.name || 'Individual'
                  }
                  status={selectedItem.verification_status}
                  badgeNumber={selectedItem.ca_badge_number}
                  size="md"
                  nameClassName="truncate text-lg font-semibold text-gram-ink"
                />
              ) : null}
            </DialogTitle>
            <DialogDescription>
              {selectedType
                ? isCaReviewLocked(selectedItem)
                  ? String(selectedItem?.verification_status || '').toLowerCase() === 'unverified'
                    ? 'View only. Unverified accounts must resubmit before a CA can approve them.'
                    : 'View verified details'
                  : selectedItem?.reverification_pending
                    ? 'Review updated certificates and re-allot tags'
                    : caReviewDescription(selectedType)
                : ''}
            </DialogDescription>
          </DialogHeader>

          {selectedItem && selectedType && (
            <div className="space-y-6">
              <CAVerificationReview
                item={selectedItem}
                type={selectedType}
                ocrLoading={reviewLoading}
                complianceTags={complianceTags}
                onComplianceTagsChange={isCaReviewLocked(selectedItem) ? undefined : setComplianceTags}
                readOnly={isCaReviewLocked(selectedItem)}
              />

              {!isCaReviewLocked(selectedItem) ? (
                <>
              {/* Rejection Reason */}
              <div>
                <label className="text-sm font-medium">Rejection Reason (if rejecting)</label>
                <Textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Provide reason for rejection..."
                  className="mt-1"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <Button
                  onClick={() => handleAction('approve')}
                  disabled={actionLoading || reviewLoading}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                    {actionLoading ? 'Processing...' : 'Approve'}
                  </Button>
                  <Button
                    onClick={() => handleAction('reject')}
                    disabled={actionLoading || reviewLoading}
                    variant="destructive"
                    className="flex-1"
                  >
                    {actionLoading ? 'Processing...' : 'Reject'}
                </Button>
              </div>
                </>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}