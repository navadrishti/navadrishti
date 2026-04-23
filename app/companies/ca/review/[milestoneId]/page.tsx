    'use client';

    import { useEffect, useState } from 'react';
    import { useRouter, useParams } from 'next/navigation';
    import { Button } from '@/components/ui/button';
    import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
    import { Badge } from '@/components/ui/badge';
    import { Textarea } from '@/components/ui/textarea';
    import { CAConsoleHeader } from '@/components/ca-console-header';
    import { mockCompanyCAContext, mockMilestoneDetailsResponse } from '@/lib/mock-ca-data';

    export default function ReviewDetailPage() {
    const router = useRouter();
    const params = useParams();
    const milestoneId = params.milestoneId as string;

    const [loading, setLoading] = useState(true);
    const [context, setContext] = useState<any>(null);
    const [reviewData, setReviewData] = useState<any>(null);
    const [comments, setComments] = useState<string>('');
    const [actionLoading, setActionLoading] = useState<'approved' | 'rejected' | null>(null);
    const [panelMessage, setPanelMessage] = useState<string>('');
    const [useMockData, setUseMockData] = useState(true);

    const formatDateTime = (value: string) => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return 'N/A';
        return date.toLocaleString('en-IN', { timeZone: 'UTC' });
    };

    const fetchReviewDetails = async () => {
        setLoading(true);
        setPanelMessage('');

        try {
        if (useMockData) {
            // Use mock data for testing
            setContext(mockCompanyCAContext);
            setReviewData(mockMilestoneDetailsResponse.data);
        } else {
            // Use real API calls
            const verifyResponse = await fetch('/api/companies/ca/verify', {
            credentials: 'include'
            });

            const verifyPayload = await verifyResponse.json();
            if (!verifyResponse.ok || !verifyPayload?.success) {
            router.push('/companies/ca/login');
            return;
            }

            setContext(verifyPayload.company_ca);

            // Fetch milestone details - you may need to adjust this endpoint
            const milestoneResponse = await fetch(`/api/milestones/${milestoneId}`, {
            credentials: 'include'
            });

            const milestonePayload = await milestoneResponse.json();
            if (milestoneResponse.ok && milestonePayload?.success) {
            setReviewData(milestonePayload.data);
            } else {
            setPanelMessage('Failed to load milestone details.');
            }
        }
        } catch (error) {
        if (!useMockData) {
            setPanelMessage('Error loading review details.');
            console.error(error);
        }
        } finally {
        setLoading(false);
        }
    };

    const handleDecision = async (decision: 'approved' | 'rejected') => {
        if (!comments.trim() && decision === 'rejected') {
        setPanelMessage('Please provide comments for rejection.');
        return;
        }

        setActionLoading(decision);
        setPanelMessage('');

        try {
        if (useMockData) {
            // Mock API response for testing
            setPanelMessage(`Evidence ${decision} successfully! (Mock)`);
            setTimeout(() => {
            router.push('/companies/ca');
            }, 2000);
        } else {
            // Real API call
            const response = await fetch(`/api/milestones/${milestoneId}/review`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                decision,
                comments: comments || '',
                evidence_id: reviewData?.evidence?.[0]?.id || null
            })
            });

            const payload = await response.json();
            if (!response.ok || !payload?.success) {
            setPanelMessage(payload?.error || `Failed to ${decision} evidence.`);
            return;
            }

            setPanelMessage(`Evidence ${decision} successfully!`);
            setTimeout(() => {
            router.push('/companies/ca');
            }, 2000);
        }
        } catch (error) {
        setPanelMessage(`Failed to ${decision} evidence.`);
        console.error(error);
        } finally {
        setActionLoading(null);
        }
    };

    const logout = async () => {
        await fetch('/api/companies/ca/logout', {
        method: 'POST',
        credentials: 'include'
        });
        router.push('/companies/ca/login');
    };

    const handleChangePassword = () => {
        router.push('/companies/ca/settings');
    };

    useEffect(() => {
        fetchReviewDetails();
    }, [milestoneId, useMockData]);

    if (loading) {
        return <div className="min-h-screen p-6 bg-slate-100">Loading review details...</div>;
    }

    if (!reviewData) {
        return (
        <div className="min-h-screen bg-slate-100">
            <CAConsoleHeader
            title="Review Detail"
            subtitle={`Company ID: ${context?.company_user_id || 'Loading...'}`}
            accountName={context?.company?.name || context?.company_name || context?.user?.name}
            accountEmail={context?.user?.email || 'testing@example.com'}
            userId={context?.company_user_id}
            onLogout={logout}
            onChangePassword={handleChangePassword}
            />
            <div className="mx-auto max-w-4xl px-6 pt-6 pb-10">
            <Button variant="outline" onClick={() => router.push('/companies/ca')}>
                ← Back to Dashboard
            </Button>
            <Card className="mt-6">
                <CardContent className="pt-6 text-slate-600">
                Milestone not found or unable to load details.
                </CardContent>
            </Card>
            </div>
        </div>
        );
    }

    const evidence = Array.isArray(reviewData.evidence) ? reviewData.evidence : [];

    return (
        <div className="min-h-screen bg-slate-100">
        <CAConsoleHeader
            title="Review Milestone"
            subtitle={`Company ID: ${context?.company_user_id || 'Loading...'}`}
            accountName={context?.company?.name || context?.company_name || context?.user?.name}
            accountEmail={context?.user?.email || 'testing@example.com'}
            userId={context?.company_user_id}
            onLogout={logout}
            onChangePassword={handleChangePassword}
        />

        <div className="mx-auto max-w-4xl px-6 pt-6 pb-10 space-y-6">

            {/* Mock Data Toggle - Development Only */}
            <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
                <label className="text-sm text-slate-600">Use Mock Data:</label>
                <button
                onClick={() => setUseMockData(!useMockData)}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                    useMockData
                    ? 'bg-blue-100 text-blue-700 border border-blue-300'
                    : 'bg-gray-100 text-gray-600 border border-gray-300'
                }`}
                >
                {useMockData ? 'ON (Mock)' : 'OFF (API)'}
                </button>
            </div>
            <div className="text-xs text-slate-500">
                {useMockData ? 'Using sample data for testing' : 'Using live API data'}
            </div>
            </div>

            {panelMessage ? (
            <Card>
                <CardContent className="pt-4 text-sm text-slate-700">{panelMessage}</CardContent>
            </Card>
            ) : null}

            {/* Back Button */}
            <Button variant="outline" onClick={() => router.push('/companies/ca')}>
            ← Back to Dashboard
            </Button>

            {/* Milestone Details */}
            <Card>
            <CardHeader>
                <CardTitle>{reviewData.title}</CardTitle>
                <CardDescription>Review and approve or reject this milestone's evidence</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                    <p className="text-sm font-medium text-slate-600">Milestone ID</p>
                    <p className="text-lg text-slate-900">{reviewData.id}</p>
                </div>
                <div>
                    <p className="text-sm font-medium text-slate-600">Status</p>
                    <Badge variant="outline">{reviewData.status}</Badge>
                </div>
                <div>
                    <p className="text-sm font-medium text-slate-600">Due Date</p>
                    <p className="text-slate-900">{formatDateTime(reviewData.due_date) || 'N/A'}</p>
                </div>
                <div>
                    <p className="text-sm font-medium text-slate-600">Amount</p>
                    <p className="text-lg text-slate-900">Rs {reviewData.amount || 0}</p>
                </div>
                </div>
                {reviewData.description && (
                <div>
                    <p className="text-sm font-medium text-slate-600">Description</p>
                    <p className="text-slate-700">{reviewData.description}</p>
                </div>
                )}
            </CardContent>
            </Card>

            {/* Evidence */}
            <Card>
            <CardHeader>
                <CardTitle>Submitted Evidence</CardTitle>
                <CardDescription>Review all evidence files and details</CardDescription>
            </CardHeader>
            <CardContent>
                {evidence.length === 0 ? (
                <p className="text-sm text-slate-600">No evidence files submitted.</p>
                ) : (
                <div className="space-y-4">
                    {evidence.map((ev: any, idx: number) => (
                    <div key={ev.id || idx} className="rounded-md border bg-slate-50 p-4">
                        <div className="mb-2 flex items-start justify-between">
                        <h4 className="font-medium text-slate-900">Evidence #{idx + 1}</h4>
                        <Badge>{ev.id}</Badge>
                        </div>
                        
                        {ev.description && (
                        <div className="mb-2">
                            <p className="text-sm font-medium text-slate-600">Description</p>
                            <p className="text-sm text-slate-700">{ev.description}</p>
                        </div>
                        )}

                        {ev.captured_at && (
                        <div className="mb-2">
                            <p className="text-sm font-medium text-slate-600">Captured At</p>
                            <p className="text-sm text-slate-700">{formatDateTime(ev.captured_at)}</p>
                        </div>
                        )}

                        {(ev.gps_lat || ev.gps_long) && (
                        <div className="mb-2">
                            <p className="text-sm font-medium text-slate-600">GPS Location</p>
                            <p className="text-sm text-slate-700">
                            {ev.gps_lat || 'N/A'}, {ev.gps_long || 'N/A'}
                            </p>
                        </div>
                        )}

                        {Array.isArray(ev.media) && ev.media.length > 0 && (
                        <div className="mb-2">
                            <p className="text-sm font-medium text-slate-600">Media Files</p>
                            <div className="space-y-1">
                            {ev.media.map((media: any) => (
                                <a
                                key={media.id}
                                href={media.media_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm text-blue-700 underline block"
                                >
                                📷 {media.file_name || media.media_url}
                                </a>
                            ))}
                            </div>
                        </div>
                        )}

                        {Array.isArray(ev.documents) && ev.documents.length > 0 && (
                        <div>
                            <p className="text-sm font-medium text-slate-600">Documents</p>
                            <div className="space-y-1">
                            {ev.documents.map((doc: any) => (
                                <a
                                key={doc.id}
                                href={doc.document_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm text-blue-700 underline block"
                                >
                                📄 {doc.file_name || doc.document_url}
                                </a>
                            ))}
                            </div>
                        </div>
                        )}
                    </div>
                    ))}
                </div>
                )}
            </CardContent>
            </Card>

            {/* Decision Form */}
            <Card>
            <CardHeader>
                <CardTitle>Decision</CardTitle>
                <CardDescription>Approve or reject this milestone's evidence</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div>
                <label className="text-sm font-medium text-slate-600">Comments</label>
                <Textarea
                    placeholder="Add comments for your decision..."
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    className="mt-2"
                    rows={4}
                />
                </div>
                <div className="flex gap-3">
                <Button
                    onClick={() => handleDecision('approved')}
                    disabled={actionLoading !== null}
                    className="flex-1"
                >
                    {actionLoading === 'approved' ? 'Approving...' : '✓ Approve Evidence'}
                </Button>
                <Button
                    variant="destructive"
                    onClick={() => handleDecision('rejected')}
                    disabled={actionLoading !== null}
                    className="flex-1"
                >
                    {actionLoading === 'rejected' ? 'Rejecting...' : '✗ Reject Evidence'}
                </Button>
                </div>
            </CardContent>
            </Card>
        </div>
        </div>
    );
    }
