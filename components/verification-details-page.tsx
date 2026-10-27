'use client';

import { useState, useEffect, useEffectEvent, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { CaQueueAccountTitle, CaQueueStatusBadge } from '@/components/ca-queue-status';
import { NgoComplianceBadges } from '@/components/verification-badge';
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
import { toast } from 'sonner';

type VerificationDetail = CAReviewItem & {
  user_id: number;
};

interface VerificationDetailsPageProps {
  type: 'individuals' | 'companies' | 'ngos';
  initialStatus?: 'all' | 'pending' | 'verified';
}

export default function VerificationDetailsPage({
  type,
  initialStatus = 'all',
}: VerificationDetailsPageProps) {
  const [items, setItems] = useState<VerificationDetail[]>([]);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'verified'>(initialStatus);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<VerificationDetail | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [complianceTags, setComplianceTags] = useState<string[]>([]);
  const [loadError, setLoadError] = useState('');

  const fetchItems = async () => {
    try {
      setLoading(true);
      setLoadError('');
      const response = await fetch(`/api/ca/queue?type=${type}&status=all`, {
        credentials: 'include',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setLoadError(data.error || 'The verification queue could not be loaded.');
        return;
      }
      setItems((data.data || []).map((item: VerificationDetail) => sanitizeCaReviewItem(item)));
    } catch (error) {
      console.error('Failed to fetch items:', error);
      setLoadError('The verification queue could not be loaded. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchItemsForType = useEffectEvent(fetchItems);

  useEffect(() => {
    fetchItemsForType();
  }, [type]);

  const openReview = async (item: VerificationDetail) => {
    const safeItem = sanitizeCaReviewItem(item);
    setSelectedItem(safeItem);
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
        const review = sanitizeCaReviewItem(data.data as VerificationDetail);
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
    if (!selectedItem) return;
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
          entity_type: type,
          entity_id: selectedItem.id,
          action: action === 'approve' ? 'approve' : 'reject',
          reason: rejectionReason,
          compliance_tags: type === 'ngos' ? complianceTags : undefined,
        })
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        toast.success(data.message || `${selectedItem.name || selectedItem.company_name || selectedItem.ngo_name} ${action === 'approve' ? 'approved' : 'rejected'}`);
        setItems(items.filter(item => item.id !== selectedItem.id));
        setSelectedItem(null);
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

  const getDisplayName = () => {
    const names = {
      individuals: 'Individual Verifications',
      companies: 'Company Verifications',
      ngos: 'NGO Verifications'
    };
    return names[type];
  };

  const visibleItems = useMemo(() => {
    if (filterStatus === 'pending') {
      return items.filter((item) => {
        const status = String(item.verification_status || '').toLowerCase();
        return status === 'pending' || Boolean(item.reverification_pending);
      });
    }
    if (filterStatus === 'verified') {
      return items.filter((item) => String(item.verification_status || '').toLowerCase() === 'verified');
    }
    return items;
  }, [filterStatus, items]);

  const applyFilter = (value: 'all' | 'pending' | 'verified') => {
    if (value === filterStatus) return;
    setFilterStatus(value);
    const url = new URL(window.location.href);
    if (value === 'all') url.searchParams.delete('status');
    else url.searchParams.set('status', value);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  };

  const getListItemDisplay = (item: VerificationDetail) => {
    if (type === 'individuals') {
      return {
        title: item.name || 'Individual',
        subtitle: item.phone || '',
        details: [item.email, item.pan ? `PAN ${item.pan}` : ''].filter(Boolean),
      };
    }
    if (type === 'companies') {
      return {
        title: item.company_name || 'Company',
        subtitle: item.business_description || '',
        details: [
          item.email,
          item.gst ? `GST ${item.gst}` : '',
          item.cin ? `CIN ${item.cin}` : '',
          item.pan ? `PAN ${item.pan}` : '',
        ].filter(Boolean),
      };
    }
    return {
      title: item.ngo_name || 'NGO',
      subtitle: item.ngo_description || '',
      details: [
        item.email,
        item.phone || '',
        item.registration_number ? `Reg. ${item.registration_number}` : '',
        item.csr1 ? `CSR-1 ${item.csr1}` : '',
      ].filter(Boolean),
    };
  };

  return (
    <div className="space-y-6">
        <div className="space-y-3">
          <Button
            asChild
            variant="ghost"
            className="h-auto px-0 text-udaan-orange hover:bg-transparent hover:text-udaan-orange"
          >
            <Link href="/ca">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold">{getDisplayName()}</h1>
            <Badge variant="secondary">{loading ? '…' : visibleItems.length}</Badge>
          </div>
          <div className="flex bg-slate-100 rounded-lg p-1 gap-1 self-start">
            {([
              { label: 'All', value: 'all' },
              { label: 'Pending', value: 'pending' },
              { label: 'Verified', value: 'verified' },
            ] as const).map(({ label, value }) => (
              <button
                key={value}
                onClick={() => applyFilter(value)}
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

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {loading
            ? [1, 2, 3, 4, 5, 6].map((i) => (
                <Card key={i} className="bg-white">
                  <CardHeader className="space-y-2 pb-3">
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-4 w-full" />
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-1/3" />
                  </CardContent>
                </Card>
              ))
            : visibleItems.map((item) => {
                const display = getListItemDisplay(item);
                return (
                  <Card
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer bg-white transition-colors hover:border-udaan-orange/40"
                    onClick={() => openReview(item)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        void openReview(item);
                      }
                    }}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <CaQueueAccountTitle
                          name={display.title}
                          status={item.verification_status}
                          badgeNumber={item.ca_badge_number}
                          size="md"
                          className="min-w-0 flex-1"
                          nameClassName="truncate text-lg font-semibold text-gram-ink"
                        />
                        <CaQueueStatusBadge
                          status={item.verification_status}
                          reverification={item.reverification_pending}
                        />
                      </div>
                      {display.subtitle ? (
                        <CardDescription className="line-clamp-2">{display.subtitle}</CardDescription>
                      ) : null}
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {display.details.map((detail) => (
                        <div key={detail} className="truncate text-sm text-slate-600">
                          {detail}
                        </div>
                      ))}
                      {type === 'ngos' ? (
                        <NgoComplianceBadges
                          tags={item.allotted_compliance_tags}
                          registrationType={item.registration_type}
                          size="sm"
                        />
                      ) : null}
                      <div className="flex items-center justify-between pt-1">
                        <Badge variant="outline">
                          {item.documents_total || 0} document{item.documents_total === 1 ? '' : 's'}
                        </Badge>
                        <span className="text-xs text-slate-500">
                          {item.reverification_pending ? 'Review updates' : 'Open details'}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
        </div>

        {!loading && visibleItems.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              {loadError ? (
                <div className="space-y-3">
                  <p className="text-red-700">{loadError}</p>
                  <Button
                    variant="outline"
                    className="border-udaan-orange text-udaan-orange hover:bg-orange-50 hover:text-udaan-orange"
                    onClick={() => void fetchItems()}
                  >
                    Try again
                  </Button>
                </div>
              ) : (
                <p className="text-slate-500">No accounts in this list</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Detail Modal */}
        <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {selectedItem ? (
                  <CaQueueAccountTitle
                    name={
                      type === 'individuals'
                        ? selectedItem.name || 'Individual'
                        : type === 'companies'
                          ? selectedItem.company_name || 'Company'
                          : selectedItem.ngo_name || 'NGO'
                    }
                    status={selectedItem.verification_status}
                    badgeNumber={selectedItem.ca_badge_number}
                    size="md"
                    nameClassName="truncate text-lg font-semibold text-gram-ink"
                  />
                ) : null}
              </DialogTitle>
              <DialogDescription>
                {isCaReviewLocked(selectedItem)
                  ? String(selectedItem?.verification_status || '').toLowerCase() === 'unverified'
                    ? 'View only. Unverified accounts must resubmit before a CA can approve them.'
                    : 'View verified details'
                  : caReviewDescription(type)}
                {selectedItem?.reverification_pending
                  ? ' Review updated certificates and re-allot tags.'
                  : ''}
              </DialogDescription>
            </DialogHeader>

            {selectedItem && (
              <div className="space-y-6">
                <CAVerificationReview
                  item={selectedItem}
                  type={type}
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
