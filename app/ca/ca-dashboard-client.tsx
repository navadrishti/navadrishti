'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface CADashboardData {
  stats: {
    total_projects: number;
    pending_evidence_reviews: number;
    pending_payment_confirmations: number;
    payments_confirmed_today: number;
    total_confirmed_funds: number;
    overall_progress_percentage: number;
  };
  pendingEvidenceQueue: Array<{
    milestone_id: string;
    milestone_title: string;
    project_id: string;
    project_title: string;
    due_date: string | null;
    amount: number;
    milestone_order: number;
    updated_at: string;
  }>;
  pendingPayments: Array<{
    payment_id: string;
    payment_reference: string;
    amount: number;
    project_id: string;
    project_title: string;
    milestone_id: string;
    created_at: string;
  }>;
}

export default function CADashboardClient() {
  const [dashboardData, setDashboardData] = useState<CADashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoadingKey, setActionLoadingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/ca/dashboard', {
        credentials: 'include'
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to load CA dashboard');
      }

      setDashboardData(data);
      setLoading(false);
      
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      setLoading(false);
    }
  };

  const reviewEvidence = async (milestoneId: string, decision: 'approved' | 'rejected') => {
    const comments = window.prompt(`Enter comments for ${decision}:`) || '';
    const loadingKey = `review-${milestoneId}-${decision}`;
    setActionLoadingKey(loadingKey);
    setMessage('');

    try {
      const response = await fetch(`/api/milestones/${milestoneId}/review`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ decision, comments })
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        setMessage(payload?.error || 'Failed to submit review decision.');
        return;
      }

      setMessage(`Evidence ${decision} successfully.`);
      await fetchDashboardData();
    } catch {
      setMessage('Failed to submit review decision.');
    } finally {
      setActionLoadingKey(null);
    }
  };

  const confirmPayment = async (milestoneId: string, paymentReference: string, amount: number) => {
    const loadingKey = `payment-${milestoneId}`;
    setActionLoadingKey(loadingKey);
    setMessage('');

    try {
      const response = await fetch(`/api/milestones/${milestoneId}/payment`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          payment_reference: paymentReference,
          amount,
          payment_status: 'confirmed'
        })
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        setMessage(payload?.error || 'Failed to confirm payment.');
        return;
      }

      setMessage('Payment confirmed successfully.');
      await fetchDashboardData();
    } catch {
      setMessage('Failed to confirm payment.');
    } finally {
      setActionLoadingKey(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-8">
        {/* Welcome Section Skeleton */}
        <div>
          <Skeleton className="h-9 w-80 mb-2" />
          <Skeleton className="h-6 w-96" />
        </div>

        {/* Stats Grid Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="bg-white border-blue-200">
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-9 w-16 mb-2" />
                <Skeleton className="h-3 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Cases List Skeleton */}
        <Card className="bg-white border-blue-200">
          <CardHeader>
            <Skeleton className="h-7 w-48 mb-2" />
            <Skeleton className="h-5 w-64" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="border border-blue-200 rounded-lg p-4 bg-blue-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center space-x-3">
                        <Skeleton className="h-6 w-48" />
                        <Skeleton className="h-5 w-16" />
                        <Skeleton className="h-5 w-16" />
                      </div>
                      <div className="flex items-center space-x-4">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-4 w-4 rounded-full" />
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-4 w-4 rounded-full" />
                        <Skeleton className="h-5 w-24" />
                      </div>
                    </div>
                    <Skeleton className="h-9 w-20" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div>
        <h1 className="text-3xl font-bold text-blue-900">CA Evidence Control Dashboard</h1>
        <p className="mt-2 text-blue-700">Approve milestone evidence, verify payments, and maintain audit integrity</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Projects */}
        <Card className="bg-white border-blue-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-blue-600">Total Projects</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-900">{dashboardData?.stats.total_projects || 0}</div>
            <p className="text-xs text-blue-500 mt-1">Projects under CA governance</p>
          </CardContent>
        </Card>

        {/* Pending Evidence */}
        <Card className="bg-white border-orange-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-orange-600">Pending Evidence</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">{dashboardData?.stats.pending_evidence_reviews || 0}</div>
            <p className="text-xs text-orange-500 mt-1">Milestones waiting for CA decision</p>
          </CardContent>
        </Card>

        {/* Pending Payments */}
        <Card className="bg-white border-blue-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-blue-600">Pending Payments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{dashboardData?.stats.pending_payment_confirmations || 0}</div>
            <p className="text-xs text-blue-500 mt-1">Payment confirmations awaiting CA signoff</p>
          </CardContent>
        </Card>

        {/* Confirmed Funds */}
        <Card className="bg-white border-green-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-green-600">Confirmed Funds</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">Rs {dashboardData?.stats.total_confirmed_funds || 0}</div>
            <p className="text-xs text-green-500 mt-1">
              {dashboardData?.stats.payments_confirmed_today || 0} confirmed today
            </p>
          </CardContent>
        </Card>
      </div>

      {message ? (
        <p className="text-sm text-blue-700">{message}</p>
      ) : null}

      {/* Pending Evidence Queue */}
      <Card className="bg-white border-blue-200">
        <CardHeader>
          <CardTitle className="text-blue-900">Pending Evidence Queue</CardTitle>
          <CardDescription className="text-blue-600">Only CA can approve/reject milestone evidence</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {(dashboardData?.pendingEvidenceQueue || []).map((item) => (
              <div 
                key={item.milestone_id} 
                className="border border-blue-200 rounded-lg p-4 hover:border-orange-400 hover:shadow-md transition-all bg-blue-50"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="font-semibold text-blue-900">{item.project_title}</h3>
                      <Badge variant="outline" className="text-xs">
                        M{item.milestone_order}
                      </Badge>
                      <Badge className="bg-orange-100 text-orange-800">Awaiting Review</Badge>
                    </div>
                    
                    <div className="flex items-center space-x-4 text-sm text-blue-700">
                      <span>{item.milestone_title}</span>
                      <span>•</span>
                      <span>Due: {item.due_date || 'N/A'}</span>
                      <span>•</span>
                      <span>Amount: Rs {item.amount || 0}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => reviewEvidence(item.milestone_id, 'approved')}
                      disabled={actionLoadingKey === `review-${item.milestone_id}-approved`}
                    >
                      {actionLoadingKey === `review-${item.milestone_id}-approved` ? 'Approving...' : 'Approve'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => reviewEvidence(item.milestone_id, 'rejected')}
                      disabled={actionLoadingKey === `review-${item.milestone_id}-rejected`}
                    >
                      {actionLoadingKey === `review-${item.milestone_id}-rejected` ? 'Rejecting...' : 'Reject'}
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            {(dashboardData?.pendingEvidenceQueue || []).length === 0 && (
              <div className="text-center py-8 text-blue-500">
                <p>No pending evidence reviews at the moment</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Pending Payment Queue */}
      <Card className="bg-white border-blue-200">
        <CardHeader>
          <CardTitle className="text-blue-900">Pending Payment Confirmations</CardTitle>
          <CardDescription className="text-blue-600">Only CA can verify transfer and receiving records</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {(dashboardData?.pendingPayments || []).map((payment) => (
              <div key={payment.payment_id} className="rounded-md border bg-blue-50 p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-medium text-blue-900">{payment.project_title}</p>
                    <p className="text-sm text-blue-700">Ref: {payment.payment_reference}</p>
                  </div>
                  <Badge className="bg-blue-100 text-blue-800 w-fit">Pending CA Confirmation</Badge>
                </div>
                <p className="mt-2 text-sm text-blue-700">Amount: Rs {payment.amount || 0}</p>
                <div className="mt-3">
                  <Button
                    size="sm"
                    onClick={() => confirmPayment(payment.milestone_id, payment.payment_reference, payment.amount)}
                    disabled={actionLoadingKey === `payment-${payment.milestone_id}`}
                  >
                    {actionLoadingKey === `payment-${payment.milestone_id}` ? 'Confirming...' : 'Confirm Payment'}
                  </Button>
                </div>
              </div>
            ))}

            {(dashboardData?.pendingPayments || []).length === 0 && (
              <div className="text-center py-6 text-blue-500">
                <p>No pending payment confirmations</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
