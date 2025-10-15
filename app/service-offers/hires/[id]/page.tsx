'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, Loader2, Users, Mail, Phone, Calendar, CheckCircle, XCircle, Clock, DollarSign } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/hooks/use-toast'
import Link from 'next/link'

interface ServiceOffer {
  id: number;
  title: string;
  description: string;
  category: string;
  location: string;
  price_type: string;
  price_amount: number;
  status: string;
  created_at: string;
}

interface Hire {
  id: number;
  client_id: number;
  client_name: string;
  client_email: string;
  client_type: 'individual' | 'company';
  message: string;
  status: 'pending' | 'accepted' | 'rejected' | 'active' | 'completed' | 'cancelled';
  created_at: string;
  start_date?: string;
  end_date?: string;
  amount_paid: number;
}

export default function ServiceOfferHiresPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [offer, setOffer] = useState<ServiceOffer | null>(null);
  const [hires, setHires] = useState<Hire[]>([]);
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
        description: "Only NGOs can view hires",
        variant: "destructive",
      });
      router.push('/service-offers');
      return;
    }
  }, [user, router, toast]);

  // Fetch offer and hires data
  useEffect(() => {
    if (!user || !params.id) return;

    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token');
        
        // Fetch offer details
        const offerResponse = await fetch(`/api/service-offers/${params.id}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        const offerData = await offerResponse.json();

        if (offerData.success) {
          setOffer(offerData.data);
        } else {
          toast({
            title: "Error",
            description: offerData.error || "Failed to fetch offer details",
            variant: "destructive",
          });
          router.push('/service-offers');
          return;
        }

        // Fetch hires
        const hiresResponse = await fetch(`/api/service-offers/${params.id}/hires`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        const hiresData = await hiresResponse.json();

        if (hiresData.success) {
          setHires(hiresData.data);
        } else {
          console.error('Failed to fetch hires:', hiresData.error);
        }

      } catch (error) {
        console.error('Error fetching data:', error);
        toast({
          title: "Error",
          description: "Failed to fetch data",
          variant: "destructive",
        });
        router.push('/service-offers');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, params.id, router, toast]);

  const handleHireStatusUpdate = async (hireId: number, newStatus: string) => {
    setUpdating(hireId);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/service-offers/${params.id}/hires/${hireId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await response.json();

      if (data.success) {
        setHires(prev => 
          prev.map(h => h.id === hireId ? { ...h, status: newStatus as any } : h)
        );
        toast({
          title: "Success",
          description: `Hire ${newStatus === 'accepted' ? 'accepted' : 'rejected'} successfully`,
        });
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to update hire status",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error updating hire status:', error);
      toast({
        title: "Error",
        description: "Failed to update hire status",
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

  const getPriceDisplay = (offer: ServiceOffer) => {
    if (offer.price_type === 'free') return 'Free';
    if (offer.price_type === 'donation') return 'Donation Based';
    if (offer.price_type === 'fixed') return `₹${offer.price_amount}`;
    if (offer.price_type === 'negotiable') return 'Negotiable';
    return 'Price not set';
  };

  const filterHiresByStatus = (status: string) => {
    return hires.filter(h => h.status === status);
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

  if (!offer) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Offer Not Found</h1>
            <Link href="/service-offers">
              <Button>Back to Offers</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const pendingHires = filterHiresByStatus('pending');
  const acceptedHires = filterHiresByStatus('accepted');
  const activeHires = filterHiresByStatus('active');
  const completedHires = filterHiresByStatus('completed');

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Link href="/service-offers?view=my-offers" className="inline-flex items-center text-blue-600 hover:text-blue-800">
            <ArrowLeft size={20} className="mr-2" />
            Back to My Offers
          </Link>
        </div>

        {/* Offer Details Card */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-2xl mb-2">{offer.title}</CardTitle>
                <div className="flex gap-2 mb-4">
                  <Badge variant="secondary">{offer.category}</Badge>
                  <Badge variant="outline" className="flex items-center gap-1">
                    <DollarSign size={14} />
                    {getPriceDisplay(offer)}
                  </Badge>
                  {getStatusBadge(offer.status)}
                </div>
              </div>
              <div className="text-right text-sm text-gray-500">
                <p>Created: {new Date(offer.created_at).toLocaleDateString()}</p>
                <p className="flex items-center gap-1 mt-1">
                  <Users size={16} />
                  {hires.length} hire{hires.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700 mb-4">{offer.description}</p>
            {offer.location && (
              <p className="text-sm text-gray-500">📍 {offer.location}</p>
            )}
          </CardContent>
        </Card>

        {/* Hires Tabs */}
        <Tabs defaultValue="pending" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="pending" className="relative">
              Pending {pendingHires.length > 0 && (
                <Badge className="ml-2 bg-yellow-500 text-white text-xs">{pendingHires.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="accepted">
              Accepted {acceptedHires.length > 0 && (
                <Badge className="ml-2 bg-green-500 text-white text-xs">{acceptedHires.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="active">
              Active {activeHires.length > 0 && (
                <Badge className="ml-2 bg-blue-500 text-white text-xs">{activeHires.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="completed">
              Completed {completedHires.length > 0 && (
                <Badge className="ml-2 bg-gray-500 text-white text-xs">{completedHires.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Pending Hires */}
          <TabsContent value="pending">
            <div className="space-y-4">
              {pendingHires.length === 0 ? (
                <Card>
                  <CardContent className="pt-6 text-center text-gray-500">
                    <Clock className="mx-auto mb-2" size={48} />
                    <p>No pending hire requests</p>
                  </CardContent>
                </Card>
              ) : (
                pendingHires.map((hire) => (
                  <Card key={hire.id}>
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold">{hire.client_name}</h3>
                            <Badge variant="outline">
                              {hire.client_type === 'individual' ? 'Individual' : 'Company'}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                            <span className="flex items-center gap-1">
                              <Mail size={14} />
                              {hire.client_email}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar size={14} />
                              Requested {new Date(hire.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          {hire.message && (
                            <div className="bg-gray-50 p-3 rounded-lg mb-3">
                              <p className="text-sm text-gray-700">
                                <strong>Message:</strong> {hire.message}
                              </p>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 ml-4">
                          <Button
                            size="sm"
                            onClick={() => handleHireStatusUpdate(hire.id, 'accepted')}
                            disabled={updating === hire.id}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            {updating === hire.id ? (
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
                            onClick={() => handleHireStatusUpdate(hire.id, 'rejected')}
                            disabled={updating === hire.id}
                            className="border-red-200 text-red-600 hover:bg-red-50"
                          >
                            {updating === hire.id ? (
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

          {/* Accepted Hires */}
          <TabsContent value="accepted">
            <div className="space-y-4">
              {acceptedHires.length === 0 ? (
                <Card>
                  <CardContent className="pt-6 text-center text-gray-500">
                    <CheckCircle className="mx-auto mb-2" size={48} />
                    <p>No accepted hires</p>
                  </CardContent>
                </Card>
              ) : (
                acceptedHires.map((hire) => (
                  <Card key={hire.id}>
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold">{hire.client_name}</h3>
                            <Badge variant="outline">
                              {hire.client_type === 'individual' ? 'Individual' : 'Company'}
                            </Badge>
                            {getStatusBadge(hire.status)}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                            <span className="flex items-center gap-1">
                              <Mail size={14} />
                              {hire.client_email}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar size={14} />
                              Accepted {new Date(hire.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          {hire.message && (
                            <div className="bg-gray-50 p-3 rounded-lg">
                              <p className="text-sm text-gray-700">
                                <strong>Message:</strong> {hire.message}
                              </p>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 ml-4">
                          <Button
                            size="sm"
                            onClick={() => handleHireStatusUpdate(hire.id, 'active')}
                            disabled={updating === hire.id}
                          >
                            {updating === hire.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              'Start Service'
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

          {/* Active Hires */}
          <TabsContent value="active">
            <div className="space-y-4">
              {activeHires.length === 0 ? (
                <Card>
                  <CardContent className="pt-6 text-center text-gray-500">
                    <Users className="mx-auto mb-2" size={48} />
                    <p>No active services</p>
                  </CardContent>
                </Card>
              ) : (
                activeHires.map((hire) => (
                  <Card key={hire.id}>
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold">{hire.client_name}</h3>
                            <Badge variant="outline">
                              {hire.client_type === 'individual' ? 'Individual' : 'Company'}
                            </Badge>
                            {getStatusBadge(hire.status)}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                            <span className="flex items-center gap-1">
                              <Mail size={14} />
                              {hire.client_email}
                            </span>
                            {hire.start_date && (
                              <span className="flex items-center gap-1">
                                <Calendar size={14} />
                                Started {new Date(hire.start_date).toLocaleDateString()}
                              </span>
                            )}
                            {hire.amount_paid > 0 && (
                              <span className="text-green-600 font-medium flex items-center gap-1">
                                <DollarSign size={14} />
                                ₹{hire.amount_paid} paid
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 ml-4">
                          <Button
                            size="sm"
                            onClick={() => handleHireStatusUpdate(hire.id, 'completed')}
                            disabled={updating === hire.id}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            {updating === hire.id ? (
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

          {/* Completed Hires */}
          <TabsContent value="completed">
            <div className="space-y-4">
              {completedHires.length === 0 ? (
                <Card>
                  <CardContent className="pt-6 text-center text-gray-500">
                    <CheckCircle className="mx-auto mb-2" size={48} />
                    <p>No completed services</p>
                  </CardContent>
                </Card>
              ) : (
                completedHires.map((hire) => (
                  <Card key={hire.id}>
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold">{hire.client_name}</h3>
                            <Badge variant="outline">
                              {hire.client_type === 'individual' ? 'Individual' : 'Company'}
                            </Badge>
                            {getStatusBadge(hire.status)}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <span className="flex items-center gap-1">
                              <Mail size={14} />
                              {hire.client_email}
                            </span>
                            {hire.end_date && (
                              <span className="flex items-center gap-1">
                                <Calendar size={14} />
                                Completed {new Date(hire.end_date).toLocaleDateString()}
                              </span>
                            )}
                            {hire.amount_paid > 0 && (
                              <span className="text-green-600 font-medium flex items-center gap-1">
                                <DollarSign size={14} />
                                ₹{hire.amount_paid} paid
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