'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { HeartHandshake, TicketCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import ProtectedRoute from '@/components/protected-route';
import { Header } from '@/components/header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProfileDashboardTab } from '@/components/profile-dashboard-tab';
import { DashboardQuickSidebar } from '@/components/dashboard-quick-sidebar';

function IndividualDashboardContent() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('tab') || 'service-requests';
  const [ongoingApplications, setOngoingApplications] = useState<any[]>([]);
  const [historyApplications, setHistoryApplications] = useState<any[]>([]);
  const [loadingApplications, setLoadingApplications] = useState(true);
  const sidebarItems = [
    { value: 'profile', label: 'Profile' },
    { value: 'service-requests', label: 'My Applications' },
    { value: 'services-hired', label: 'Services Hired' },
  ];

  useEffect(() => {
    const loadAssignments = async () => {
      if (!user) return

      setLoadingApplications(true)
      try {
        const token = localStorage.getItem('token')
        if (!token) return

        const [ongoingRes, historyRes] = await Promise.all([
          fetch('/api/service-request-assignments?view=ongoing', { headers: { Authorization: `Bearer ${token}` } }),
          fetch('/api/service-request-assignments?view=history', { headers: { Authorization: `Bearer ${token}` } })
        ])

        const ongoingData = await ongoingRes.json()
        const historyData = await historyRes.json()

        if (ongoingData.success) setOngoingApplications(Array.isArray(ongoingData.data) ? ongoingData.data : [])
        if (historyData.success) setHistoryApplications(Array.isArray(historyData.data) ? historyData.data : [])
      } catch {
        setOngoingApplications([])
        setHistoryApplications([])
      } finally {
        setLoadingApplications(false)
      }
    }

    loadAssignments()
  }, [user?.id])

  const navigateToTab = (value: string) => {
    router.replace(`/individuals/dashboard?tab=${value}`, { scroll: false });
  };

  return (
    <ProtectedRoute userTypes={['individual']}>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 p-4 md:p-6 lg:p-8 bg-gray-50">
          <div className="mx-auto max-w-7xl space-y-8">
            {/* Dashboard Header */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
                <p className="text-gray-500 mt-1">
                  Manage your volunteering and service engagements
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <DashboardQuickSidebar
                items={sidebarItems}
                activeTab={activeTab}
                onSelect={navigateToTab}
                desktopClassName="lg:col-span-4"
                triggerLabel="Dashboard sections"
              />

              {/* Main content */}
              <div className="lg:col-span-8">
                <Card className="min-h-[420px]">
                  <CardContent className="pt-6">
                    {activeTab === 'profile' ? (
                      <ProfileDashboardTab />
                    ) : activeTab === 'service-requests' ? (
                      <Tabs defaultValue="ongoing" className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                          <TabsTrigger value="ongoing">Ongoing</TabsTrigger>
                          <TabsTrigger value="history">History</TabsTrigger>
                        </TabsList>

                        <TabsContent value="ongoing" className="mt-4 space-y-3">
                          {loadingApplications ? (
                            <div className="p-6 text-center text-muted-foreground">Loading applications...</div>
                          ) : ongoingApplications.length === 0 ? (
                            <div className="p-8 text-center">
                              <div className="text-muted-foreground">
                                <TicketCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                <p className="text-lg font-medium mb-2">No ongoing applications</p>
                                <p className="text-sm mb-4">Accepted and active assignments will appear here.</p>
                                <Link href="/service-requests">
                                  <Button variant="outline">Browse Available Requests</Button>
                                </Link>
                              </div>
                            </div>
                          ) : ongoingApplications.map((application) => (
                            <Card key={application.id}>
                              <CardContent className="p-4 space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="font-semibold">{application.request?.title || 'Service Request'}</p>
                                    <p className="text-sm text-muted-foreground">{application.request?.project?.title || application.request?.location || 'Project not set'}</p>
                                  </div>
                                  <Badge variant="outline">{application.status}</Badge>
                                </div>
                                <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                                  <p>Assigned: {application.request?.category?.toLowerCase().includes('financial') ? `INR ${Number(application.assigned_amount || application.fulfillment_amount || 0).toLocaleString('en-IN')}` : Number(application.assigned_quantity || application.fulfillment_quantity || 0)}</p>
                                  <p>Completed: {application.response_meta?.individual_done_at ? 'Yes' : 'No'}</p>
                                </div>
                                <div className="flex gap-2">
                                  <Link href={`/service-requests/${application.request?.id}`}>
                                    <Button size="sm" variant="outline">View Need</Button>
                                  </Link>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </TabsContent>

                        <TabsContent value="history" className="mt-4 space-y-3">
                          {loadingApplications ? (
                            <div className="p-6 text-center text-muted-foreground">Loading history...</div>
                          ) : historyApplications.length === 0 ? (
                            <div className="p-8 text-center">
                              <div className="text-muted-foreground">
                                <HeartHandshake className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                <p className="text-lg font-medium mb-2">No history yet</p>
                                <p className="text-sm mb-4">Completed or rejected applications will appear here.</p>
                                <Link href="/service-requests">
                                  <Button variant="outline">Browse Needs</Button>
                                </Link>
                              </div>
                            </div>
                          ) : historyApplications.map((application) => (
                            <Card key={application.id}>
                              <CardContent className="p-4 space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="font-semibold">{application.request?.title || 'Service Request'}</p>
                                    <p className="text-sm text-muted-foreground">{application.request?.project?.title || application.request?.location || 'Project not set'}</p>
                                  </div>
                                  <Badge variant="outline">{application.status}</Badge>
                                </div>
                                <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                                  <p>{application.response_meta?.individual_done_at ? 'Marked done' : 'Closed'}</p>
                                  <p>{application.response_meta?.ngo_confirmed_at ? 'NGO confirmed' : 'Awaiting review'}</p>
                                </div>
                                <div className="flex gap-2">
                                  <Link href={`/service-requests/${application.request?.id}`}>
                                    <Button size="sm" variant="outline">View Need</Button>
                                  </Link>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </TabsContent>
                      </Tabs>
                    ) : (
                      <div className="p-8 text-center">
                        <div className="text-muted-foreground">
                          <HeartHandshake className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p className="text-lg font-medium mb-2">Services Hired Coming Soon</p>
                          <p className="text-sm mb-4">This section is reserved for service hires. Your application history stays under My Applications.</p>
                          <Link href="/service-requests">
                            <Button variant="outline">Browse Requests</Button>
                          </Link>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}

export default function IndividualDashboard() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50"><Header /><div className="container mx-auto px-4 py-8 text-gray-600">Loading dashboard...</div></div>}>
      <IndividualDashboardContent />
    </Suspense>
  );
}