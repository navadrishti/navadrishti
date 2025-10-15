'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, Loader2, Users, Mail, Phone, Calendar, CheckCircle, XCircle, Clock } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/hooks/use-toast'
import Link from 'next/link'

interface ServiceRequest {
  id: number;
  title: string;
  description: string;
  category: string;
  location: string;
  urgency_level: string;
  status: string;
  created_at: string;
}

interface Volunteer {
  id: number;
  volunteer_id: number;
  volunteer_name: string;
  volunteer_email: string;
  volunteer_type: 'individual' | 'company';
  message: string;
  status: 'pending' | 'accepted' | 'rejected' | 'active' | 'completed' | 'cancelled';
  created_at: string;
  start_date?: string;
  end_date?: string;
  hours_contributed: number;
}

export default function ServiceRequestApplicantsPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [updating, setUpdating] = useState<number | null>(null);

  // Check if user is authorized (NGO only)
  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.user_type !== 'ngo') {
      toast({
        title: "Access Denied",
        description: "Only NGOs can view applicants",
        variant: "destructive",
      });
      router.push('/service-requests');
      return;
    }
  }, [user, router, toast]);

  // Fetch request and volunteers data
  useEffect(() => {
    if (!user || !params.id) return;

    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token');
        
        // Fetch request details
        const requestResponse = await fetch(`/api/service-requests/${params.id}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        const requestData = await requestResponse.json();

        if (requestData.success) {
          setRequest(requestData.data);
        } else {
          toast({
            title: "Error",
            description: requestData.error || "Failed to fetch request details",
            variant: "destructive",
          });
          router.push('/service-requests');
          return;
        }

        // Fetch volunteers
        const volunteersResponse = await fetch(`/api/service-requests/${params.id}/volunteers`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        const volunteersData = await volunteersResponse.json();

        if (volunteersData.success) {
          setVolunteers(volunteersData.data);
        } else {
          console.error('Failed to fetch volunteers:', volunteersData.error);
        }

      } catch (error) {
        console.error('Error fetching data:', error);
        toast({
          title: "Error",
          description: "Failed to fetch data",
          variant: "destructive",
        });
        router.push('/service-requests');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, params.id, router, toast]);

  const handleVolunteerStatusUpdate = async (volunteerId: number, newStatus: string) => {
    setUpdating(volunteerId);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/service-requests/${params.id}/volunteers/${volunteerId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await response.json();

      if (data.success) {
        setVolunteers(prev => 
          prev.map(v => v.id === volunteerId ? { ...v, status: newStatus as any } : v)
        );
        toast({
          title: "Success",
          description: `Volunteer ${newStatus === 'accepted' ? 'accepted' : 'rejected'} successfully`,
        });
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to update volunteer status",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error updating volunteer status:', error);
      toast({
        title: "Error",
        description: "Failed to update volunteer status",
        variant: "destructive",
      });
    } finally {
      setUpdating(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusColors = {
      pending: 'bg-yellow-100 text-yellow-800',
      accepted: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      active: 'bg-blue-100 text-blue-800',
      completed: 'bg-gray-100 text-gray-800',
      cancelled: 'bg-gray-100 text-gray-800'
    };

    return (
      <Badge className={statusColors[status as keyof typeof statusColors] || 'bg-gray-100 text-gray-800'}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const getUrgencyBadge = (urgency: string) => {
    const urgencyColors = {
      low: 'bg-green-100 text-green-800',
      medium: 'bg-yellow-100 text-yellow-800',
      high: 'bg-orange-100 text-orange-800',
      critical: 'bg-red-100 text-red-800'
    };

    return (
      <Badge className={urgencyColors[urgency as keyof typeof urgencyColors] || 'bg-gray-100 text-gray-800'}>
        {urgency.charAt(0).toUpperCase() + urgency.slice(1)}
      </Badge>
    );
  };

  const filterVolunteersByStatus = (status: string) => {
    return volunteers.filter(v => v.status === status);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Request Not Found</h1>
            <Link href="/service-requests">
              <Button>Back to Requests</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const pendingVolunteers = filterVolunteersByStatus('pending');
  const acceptedVolunteers = filterVolunteersByStatus('accepted');
  const activeVolunteers = filterVolunteersByStatus('active');
  const completedVolunteers = filterVolunteersByStatus('completed');

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Link href="/service-requests?view=my-requests" className="inline-flex items-center text-blue-600 hover:text-blue-800">
            <ArrowLeft size={20} className="mr-2" />
            Back to My Requests
          </Link>
        </div>

        {/* Request Details Card */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-2xl mb-2">{request.title}</CardTitle>
                <div className="flex gap-2 mb-4">
                  <Badge variant="secondary">{request.category}</Badge>
                  {getUrgencyBadge(request.urgency_level)}
                  {getStatusBadge(request.status)}
                </div>
              </div>
              <div className="text-right text-sm text-gray-500">
                <p>Created: {new Date(request.created_at).toLocaleDateString()}</p>
                <p className="flex items-center gap-1 mt-1">
                  <Users size={16} />
                  {volunteers.length} applicant{volunteers.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700 mb-4">{request.description}</p>
            {request.location && (
              <p className="text-sm text-gray-500">📍 {request.location}</p>
            )}
          </CardContent>
        </Card>

        {/* Volunteers Tabs */}
        <Tabs defaultValue="pending" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="pending" className="relative">
              Pending {pendingVolunteers.length > 0 && (
                <Badge className="ml-2 bg-yellow-500 text-white text-xs">{pendingVolunteers.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="accepted">
              Accepted {acceptedVolunteers.length > 0 && (
                <Badge className="ml-2 bg-green-500 text-white text-xs">{acceptedVolunteers.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="active">
              Active {activeVolunteers.length > 0 && (
                <Badge className="ml-2 bg-blue-500 text-white text-xs">{activeVolunteers.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="completed">
              Completed {completedVolunteers.length > 0 && (
                <Badge className="ml-2 bg-gray-500 text-white text-xs">{completedVolunteers.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Pending Volunteers */}
          <TabsContent value="pending">
            <div className="space-y-4">
              {pendingVolunteers.length === 0 ? (
                <Card>
                  <CardContent className="pt-6 text-center text-gray-500">
                    <Clock className="mx-auto mb-2" size={48} />
                    <p>No pending applications</p>
                  </CardContent>
                </Card>
              ) : (
                pendingVolunteers.map((volunteer) => (
                  <Card key={volunteer.id}>
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold">{volunteer.volunteer_name}</h3>
                            <Badge variant="outline">
                              {volunteer.volunteer_type === 'individual' ? 'Individual' : 'Company'}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                            <span className="flex items-center gap-1">
                              <Mail size={14} />
                              {volunteer.volunteer_email}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar size={14} />
                              Applied {new Date(volunteer.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          {volunteer.message && (
                            <div className="bg-gray-50 p-3 rounded-lg mb-3">
                              <p className="text-sm text-gray-700">
                                <strong>Message:</strong> {volunteer.message}
                              </p>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 ml-4">
                          <Button
                            size="sm"
                            onClick={() => handleVolunteerStatusUpdate(volunteer.id, 'accepted')}
                            disabled={updating === volunteer.id}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            {updating === volunteer.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <CheckCircle size={16} className="mr-1" />
                                Accept
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleVolunteerStatusUpdate(volunteer.id, 'rejected')}
                            disabled={updating === volunteer.id}
                            className="border-red-200 text-red-600 hover:bg-red-50"
                          >
                            {updating === volunteer.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <XCircle size={16} className="mr-1" />
                                Reject
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          {/* Accepted Volunteers */}
          <TabsContent value="accepted">
            <div className="space-y-4">
              {acceptedVolunteers.length === 0 ? (
                <Card>
                  <CardContent className="pt-6 text-center text-gray-500">
                    <CheckCircle className="mx-auto mb-2" size={48} />
                    <p>No accepted volunteers</p>
                  </CardContent>
                </Card>
              ) : (
                acceptedVolunteers.map((volunteer) => (
                  <Card key={volunteer.id}>
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold">{volunteer.volunteer_name}</h3>
                            <Badge variant="outline">
                              {volunteer.volunteer_type === 'individual' ? 'Individual' : 'Company'}
                            </Badge>
                            {getStatusBadge(volunteer.status)}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                            <span className="flex items-center gap-1">
                              <Mail size={14} />
                              {volunteer.volunteer_email}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar size={14} />
                              Accepted {new Date(volunteer.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          {volunteer.message && (
                            <div className="bg-gray-50 p-3 rounded-lg">
                              <p className="text-sm text-gray-700">
                                <strong>Message:</strong> {volunteer.message}
                              </p>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 ml-4">
                          <Button
                            size="sm"
                            onClick={() => handleVolunteerStatusUpdate(volunteer.id, 'active')}
                            disabled={updating === volunteer.id}
                          >
                            {updating === volunteer.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              'Start Work'
                            )}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          {/* Active Volunteers */}
          <TabsContent value="active">
            <div className="space-y-4">
              {activeVolunteers.length === 0 ? (
                <Card>
                  <CardContent className="pt-6 text-center text-gray-500">
                    <Users className="mx-auto mb-2" size={48} />
                    <p>No active volunteers</p>
                  </CardContent>
                </Card>
              ) : (
                activeVolunteers.map((volunteer) => (
                  <Card key={volunteer.id}>
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold">{volunteer.volunteer_name}</h3>
                            <Badge variant="outline">
                              {volunteer.volunteer_type === 'individual' ? 'Individual' : 'Company'}
                            </Badge>
                            {getStatusBadge(volunteer.status)}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                            <span className="flex items-center gap-1">
                              <Mail size={14} />
                              {volunteer.volunteer_email}
                            </span>
                            {volunteer.start_date && (
                              <span className="flex items-center gap-1">
                                <Calendar size={14} />
                                Started {new Date(volunteer.start_date).toLocaleDateString()}
                              </span>
                            )}
                            {volunteer.hours_contributed > 0 && (
                              <span className="text-green-600 font-medium">
                                {volunteer.hours_contributed} hours contributed
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 ml-4">
                          <Button
                            size="sm"
                            onClick={() => handleVolunteerStatusUpdate(volunteer.id, 'completed')}
                            disabled={updating === volunteer.id}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            {updating === volunteer.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              'Mark Complete'
                            )}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          {/* Completed Volunteers */}
          <TabsContent value="completed">
            <div className="space-y-4">
              {completedVolunteers.length === 0 ? (
                <Card>
                  <CardContent className="pt-6 text-center text-gray-500">
                    <CheckCircle className="mx-auto mb-2" size={48} />
                    <p>No completed volunteers</p>
                  </CardContent>
                </Card>
              ) : (
                completedVolunteers.map((volunteer) => (
                  <Card key={volunteer.id}>
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold">{volunteer.volunteer_name}</h3>
                            <Badge variant="outline">
                              {volunteer.volunteer_type === 'individual' ? 'Individual' : 'Company'}
                            </Badge>
                            {getStatusBadge(volunteer.status)}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <span className="flex items-center gap-1">
                              <Mail size={14} />
                              {volunteer.volunteer_email}
                            </span>
                            {volunteer.end_date && (
                              <span className="flex items-center gap-1">
                                <Calendar size={14} />
                                Completed {new Date(volunteer.end_date).toLocaleDateString()}
                              </span>
                            )}
                            {volunteer.hours_contributed > 0 && (
                              <span className="text-green-600 font-medium">
                                {volunteer.hours_contributed} hours contributed
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}