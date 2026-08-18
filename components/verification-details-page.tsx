'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { CAVerificationReview, caReviewDescription, isCaReviewLocked } from '@/components/ca-verification-review';

interface VerificationDetail {
  id: number;
  user_id: number;
  [key: string]: any;
}

interface VerificationDetailsPageProps {
  type: 'individuals' | 'companies' | 'ngos';
}

export default function VerificationDetailsPage({ type }: VerificationDetailsPageProps) {
  const [items, setItems] = useState<VerificationDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<VerificationDetail | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [complianceTags, setComplianceTags] = useState<string[]>([]);

  useEffect(() => {
    fetchItems();
  }, [type]);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/ca/queue?type=${type}&status=unverified`, {
        credentials: 'include',
      });
      const data = await response.json();
      setItems(data.data || []);
    } catch (error) {
      console.error('Failed to fetch items:', error);
    } finally {
      setLoading(false);
    }
  };

  const openReview = async (item: VerificationDetail) => {
    setSelectedItem(item);
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
    if (!selectedItem) return;
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
          entity_type: type,
          entity_id: selectedItem.id,
          action: action === 'approve' ? 'approve' : 'reject',
          reason: rejectionReason,
          compliance_tags: type === 'ngos' ? complianceTags : undefined,
        })
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        alert(data.message || `${selectedItem.name || selectedItem.company_name || selectedItem.ngo_name} ${action === 'approve' ? 'approved' : 'rejected'}`);
        setItems(items.filter(item => item.id !== selectedItem.id));
        setSelectedItem(null);
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

  const getDisplayName = () => {
    const names = {
      individuals: 'Individual Verifications',
      companies: 'Company Verifications',
      ngos: 'NGO Verifications'
    };
    return names[type];
  };

  const getListItemDisplay = (item: VerificationDetail) => {
    if (type === 'individuals') {
      return {
        title: item.name,
        subtitle: item.phone || '',
        email: item.email,
        status: item.verification_status
      };
    } else if (type === 'companies') {
      return {
        title: item.company_name,
        subtitle: item.business_description,
        email: item.email,
        status: item.verification_status
      };
    } else {
      return {
        title: item.ngo_name,
        subtitle: item.ngo_description,
        email: item.email,
        status: item.verification_status
      };
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-32 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 space-y-3">
          <Link
            href="/ca"
            className="inline-flex items-center text-blue-600 hover:text-blue-800"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold">{getDisplayName()}</h1>
            <Badge variant="secondary">{items.length} pending</Badge>
          </div>
        </div>

        {/* Items Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {items.map((item) => {
            const display = getListItemDisplay(item);
            return (
              <Card
                key={item.id}
                className={`cursor-pointer bg-white`}
                onClick={() => openReview(item)}
              >
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg line-clamp-1">{display.title}</CardTitle>
                  <CardDescription className="line-clamp-2">{display.subtitle}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-sm text-gray-600 line-clamp-1">{display.email}</div>
                  <div className="flex items-center justify-between">
                    <Badge variant="outline">
                      {item.documents_verified || 0}/{item.documents_total || 0} docs
                    </Badge>
                    {item.reverification_pending ? (
                      <span className="text-xs text-slate-500">Reverification</span>
                    ) : (
                      <span className="text-xs text-gray-500">Click to review</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {items.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-gray-500">No pending verifications</p>
            </CardContent>
          </Card>
        )}

        {/* Detail Modal */}
        <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {selectedItem && (
                  type === 'individuals' ? selectedItem.name :
                  type === 'companies' ? selectedItem.company_name :
                  selectedItem.ngo_name
                )}
              </DialogTitle>
              <DialogDescription>
                {isCaReviewLocked(selectedItem)
                  ? 'View verified details'
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
    </div>
  );
}
