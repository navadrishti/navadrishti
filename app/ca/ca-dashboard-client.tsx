'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { CAVerificationReview, caReviewDescription, isCaReviewLocked } from '@/components/ca-verification-review';

interface Individual {
  id: number;
  name: string;
  email: string;
  profession: string;
  verification_status: string;
}

interface Company {
  id: number;
  company_name: string;
  email: string;
  business_description: string;
  verification_status: string;
}

interface NGO {
  id: number;
  ngo_name: string;
  email: string;
  ngo_description: string;
  verification_status: string;
  reverification_pending?: boolean;
}

type FilterStatus = 'unverified' | 'verified' | 'all';

const TABS: { label: string; value: FilterStatus }[] = [
  { label: 'Unverified', value: 'unverified' },
  { label: 'Verified',   value: 'verified'   },
  { label: 'All',        value: 'all'         },
];

const QUEUE_ITEM_HEIGHT = 'h-[6.5rem]';
const QUEUE_LIST_HEIGHT = 'h-[20.5rem]';
const QUEUE_ITEM_CLASS =
  `${QUEUE_ITEM_HEIGHT} shrink-0 cursor-pointer overflow-hidden rounded-lg border border-slate-100 bg-white p-3`;

function StatusBadge({ status, reverification }: { status: string; reverification?: boolean }) {
  const normalized = reverification ? 'reverification' : (status || '').toLowerCase();
  const styles =
    normalized === 'verified'
      ? 'border-green-200 bg-green-50 text-green-700 text-xs'
      : normalized === 'rejected'
        ? 'border-red-200 bg-red-50 text-red-700 text-xs'
        : 'border-amber-200 bg-amber-50 text-amber-700 text-xs';
  return (
    <Badge variant="outline" className={styles}>
      {normalized === 'pending' ? 'pending review' : normalized || 'unverified'}
    </Badge>
  );
}

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
        <CardTitle className="flex items-center gap-2 text-base text-udaan-blue">
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
        <Link
          href={href}
          className="inline-flex items-center justify-center gap-1 w-full h-8 rounded-md border border-input bg-background text-xs font-medium text-udaan-blue"
        >
          See full list <ArrowRight className="w-3 h-3" />
        </Link>
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
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('unverified');
  const [searchQuery, setSearchQuery]   = useState('');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [selectedType, setSelectedType] = useState<'individuals' | 'companies' | 'ngos' | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [complianceTags, setComplianceTags] = useState<string[]>([]);

  useEffect(() => {
    fetchData();
  }, [filterStatus]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError('');

      const response = await fetch(`/api/ca/queue?status=${filterStatus}`, { credentials: 'include' });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load verification queue');
      }

      setIndividuals(payload.individuals || []);
      setCompanies(payload.companies || []);
      setNGOs(payload.ngos || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

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

  const handleItemClick = async (item: any, type: 'individuals' | 'companies' | 'ngos') => {
    setSelectedItem(item);
    setSelectedType(type);
    setRejectionReason('');
    setComplianceTags(
      isCaReviewLocked(item) && Array.isArray(item.allotted_compliance_tags)
        ? item.allotted_compliance_tags
        : []
    );
    setReviewLoading(true);
    try {
      const response = await fetch(`/api/ca/review?type=${type}&id=${item.id}`, { credentials: 'include' });
      const data = await response.json();
      if (response.ok && data.data) {
        setSelectedItem(data.data);
        setComplianceTags(
          isCaReviewLocked(data.data) && Array.isArray(data.data.allotted_compliance_tags)
            ? data.data.allotted_compliance_tags
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
      alert('Please provide a reason for rejection');
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
        alert(data.message || `${selectedItem.name || selectedItem.company_name || selectedItem.ngo_name} ${action === 'approve' ? 'approved' : 'rejected'}`);
        // Remove from the list
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
        alert(data.error || 'Failed to process action');
      }
    } catch (error) {
      console.error('Action failed:', error);
      alert('Failed to process action');
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
        <h1 className="text-3xl font-bold text-slate-900">CA Verification Dashboard</h1>
        <p className="mt-1 text-slate-500">Review and approve pending individuals, companies, and NGOs</p>
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

      {/* Three columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Individuals */}
        <ColumnCard
          title="Individuals"
          count={filteredIndividuals.length}
          href="/ca/individuals"
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
              <p className="truncate text-sm font-medium text-slate-900">{ind.name}</p>
              <p className="truncate text-xs text-slate-400">{ind.email}</p>
              <div className="mt-2"><StatusBadge status={ind.verification_status} /></div>
            </div>
          ))}
        </ColumnCard>

        {/* Companies */}
        <ColumnCard
          title="Companies"
          count={filteredCompanies.length}
          href="/ca/companies"
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
              <p className="truncate text-sm font-medium text-slate-900">{comp.company_name}</p>
              <p className="truncate text-xs text-slate-500">{comp.business_description}</p>
              <p className="truncate text-xs text-slate-400">{comp.email}</p>
              <div className="mt-2"><StatusBadge status={comp.verification_status} /></div>
            </div>
          ))}
        </ColumnCard>

        {/* NGOs */}
        <ColumnCard
          title="NGOs"
          count={filteredNGOs.length}
          href="/ca/ngos"
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
              <p className="truncate text-sm font-medium text-slate-900">{ngo.ngo_name}</p>
              <p className="truncate text-xs text-slate-500">{ngo.ngo_description}</p>
              <p className="truncate text-xs text-slate-400">{ngo.email}</p>
              <div className="mt-2"><StatusBadge status={ngo.verification_status} reverification={ngo.reverification_pending} /></div>
            </div>
          ))}
        </ColumnCard>
      </div>

      {/* Item Details Dialog */}
      <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedType === 'individuals' && selectedItem?.name}
              {selectedType === 'companies' && selectedItem?.company_name}
              {selectedType === 'ngos' && selectedItem?.ngo_name}
            </DialogTitle>
            <DialogDescription>
              {selectedType
                ? isCaReviewLocked(selectedItem)
                  ? 'View verified details'
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