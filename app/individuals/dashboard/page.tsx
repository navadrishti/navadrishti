'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { HeartHandshake, TicketCheck, UserRound } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import ProtectedRoute from '@/components/protected-route';
import { Header } from '@/components/header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { VerificationBadge, VerificationDetails } from '@/components/verification-badge';

function IndividualDashboardContent() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('tab') || 'service-requests';
  const tabsRef = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState({
    acceptedServiceRequests: 0,
    acceptedServiceOffers: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const safeNumber = (value: any, defaultValue: number = 0): number => {
    const num = Number(value);
    return isNaN(num) ? defaultValue : num;
  };

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        if (!token) return;

        const response = await fetch('/api/dashboard/stats', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        const data = await response.json();
        if (data.success) {
          setStats({
            acceptedServiceRequests: safeNumber(data.data?.acceptedServiceRequests),
            acceptedServiceOffers: safeNumber(data.data?.acceptedServiceOffers)
          });
        } else {
          setError('Failed to fetch dashboard statistics');
        }
      } catch (err) {
        setError('Error fetching dashboard statistics');
        console.error('Error:', err);
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchStats();
    }
  }, [user?.id]);

  useEffect(() => {
    if (activeTab && tabsRef.current) {
      setTimeout(() => {
        tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    }
  }, [activeTab])

  return (
    <ProtectedRoute userTypes={['individual']}>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 p-4 md:p-6 lg:p-8 bg-gray-50">
          <div className="mx-auto max-w-7xl space-y-8">
            {/* Dashboard Header */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Individual Dashboard</h1>
                <p className="text-gray-500 mt-1">
                  Manage your volunteering and service engagements
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Link href="/service-requests">
                  <Button variant="outline" className="flex items-center gap-2 w-full sm:w-auto text-sm">
                    <TicketCheck className="h-4 w-4" />
                    <span className="hidden sm:inline">Browse Service Requests</span>
                    <span className="sm:hidden">Service Requests</span>
                  </Button>
                </Link>
                <Link href="/service-offers">
                  <Button className="flex items-center gap-2 w-full sm:w-auto text-sm">
                    <HeartHandshake className="h-4 w-4" />
                    Browse Service Offers
                  </Button>
                </Link>
              </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Service Requests</CardTitle>
                  <TicketCheck className="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{safeNumber(stats.acceptedServiceRequests)}</div>
                  <p className="text-xs text-gray-500">
                    Requests you've volunteered for
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Services Hired</CardTitle>
                  <HeartHandshake className="h-4 w-4 text-purple-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{safeNumber(stats.acceptedServiceOffers)}</div>
                  <p className="text-xs text-gray-500">
                    Services you've hired from NGOs
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Individual Profile Section */}
            <Card>
              <CardHeader>
                <CardTitle>Individual Profile</CardTitle>
                <CardDescription>
                  Your personal profile information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-col md:flex-row gap-6">
                  <div className="w-full md:w-1/4">
                    <div className="aspect-square rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden">
                      {user?.profile_image ? (
                        <img 
                          src={user.profile_image} 
                          alt={user?.name || 'Profile'} 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <UserRound className="h-12 w-12 text-gray-400" />
                      )}
                    </div>
                  </div>
                  <div className="w-full md:w-3/4 space-y-4">
                    <div>
                      <h3 className="text-lg font-semibold">{user?.name || 'Your Name'}</h3>
                      <p className="text-sm text-gray-500">{user?.email || 'individual@example.org'}</p>
                    </div>
                    <div className="space-y-2">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm font-medium text-gray-500">Location</p>
                          <p>{user?.city && user?.state_province ? `${user.city}, ${user.state_province}${user.country ? `, ${user.country}` : ''}` : 'Location not set'}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-500">Phone</p>
                          <div className="flex items-center gap-2">
                            <span>{user?.phone || 'Phone not set'}</span>
                            <VerificationBadge 
                              status={user?.phone_verified ? 'verified' : 'unverified'} 
                              size="sm"
                              showText={false}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-1 gap-4 mt-4">
                        <div>
                          <p className="text-sm font-medium text-gray-500">Joined</p>
                          <p>{(user as any)?.created_at ? new Date((user as any).created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long' }) : 'Join date not available'}</p>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium">Verification Status</h4>
                          <VerificationBadge 
                            status={user?.verification_status || 'unverified'} 
                            size="sm"
                            showText={false}
                          />
                        </div>
                        {user?.verification_details && (
                          <VerificationDetails 
                            userType="individual"
                            verificationDetails={user.verification_details}
                            className="bg-gray-50 p-3 rounded-lg"
                          />
                        )}
                        {user?.verification_status !== 'verified' && (
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" asChild>
                              <Link href="/verification">Complete Verification</Link>
                            </Button>
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <div className="flex gap-4 items-center">
                          <span className="text-sm font-medium text-gray-500">Email:</span>
                          <VerificationBadge 
                            status={user?.email_verified ? 'verified' : 'unverified'} 
                            size="sm"
                            showText={false}
                          />
                        </div>
                        <div className="flex gap-4 items-center">
                          <span className="text-sm font-medium text-gray-500">Phone:</span>
                          <VerificationBadge 
                            status={user?.phone_verified ? 'verified' : 'unverified'} 
                            size="sm"
                            showText={false}
                          />
                        </div>
                      </div>
                    </div>
                    <Button variant="outline" asChild>
                      <Link href="/profile">Edit Profile</Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Activity & Engagements */}
            <Card>
              <CardHeader>
                <CardTitle>Activities & Engagements</CardTitle>
                <CardDescription>
                  Track your volunteering and service activity
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div ref={tabsRef}>
                  <Tabs value={activeTab} onValueChange={(value) => {
                    window.history.replaceState(null, '', `/individuals/dashboard?tab=${value}`);
                    router.replace(`/individuals/dashboard?tab=${value}`, { scroll: false });
                  }} className="w-full">
                    <TabsList className="grid w-full grid-cols-1 sm:grid-cols-2 h-auto">
                      <TabsTrigger value="service-requests" className="text-xs sm:text-sm">Service Requests</TabsTrigger>
                      <TabsTrigger value="services-hired" className="text-xs sm:text-sm">Services Hired</TabsTrigger>
                    </TabsList>
                  
                  <TabsContent value="service-requests" className="mt-4 space-y-4">
                    <h3 className="font-medium">NGO Requests You've Volunteered For</h3>
                    <div className="rounded-md border p-8 text-center">
                      <div className="text-muted-foreground">
                        <TicketCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p className="text-lg font-medium mb-2">Service Requests Coming Soon</p>
                        <p className="text-sm mb-4">We're working on the service request system where you can volunteer for NGO projects.</p>
                        <Link href="/service-requests">
                          <Button variant="outline">Browse Available Requests</Button>
                        </Link>
                      </div>
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="services-hired" className="mt-4 space-y-4">
                    <h3 className="font-medium">Services You've Hired from NGOs</h3>
                    <div className="rounded-md border p-8 text-center">
                      <div className="text-muted-foreground">
                        <HeartHandshake className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p className="text-lg font-medium mb-2">Service Hiring Coming Soon</p>
                        <p className="text-sm mb-4">Feature to hire services from NGOs is under development.</p>
                        <Link href="/ngos">
                          <Button variant="outline">Browse NGOs</Button>
                        </Link>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}

export default function IndividualDashboard() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background"><Header /><div className="container mx-auto px-4 py-8">Loading...</div></div>}>
      <IndividualDashboardContent />
    </Suspense>
  );
}