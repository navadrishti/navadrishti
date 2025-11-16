'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast as sonnerToast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Clock, CheckCircle, XCircle, Eye, MapPin, DollarSign, Users, Calendar, LogOut } from 'lucide-react';

interface ServiceOffer {
  id: number;
  title: string;
  description: string;
  organization: {
    id: number;
    name: string;
    email: string;
    profile_image: string | null;
  };
  location: {
    state: string;
    city: string;
    area: string;
  };
  wage_info: {
    type: 'hourly' | 'daily' | 'monthly' | 'fixed';
    min_amount: number;
    max_amount: number;
    currency: string;
  };
  employment_type: string;
  duration: string;
  experience_requirements: string;
  skills_required: string[];
  admin_status: 'pending' | 'approved' | 'rejected';
  admin_reviewed_at: string | null;
  admin_reviewed_by: number | null;
  admin_comments: string | null;
  created_at: string;
}

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [serviceOffers, setServiceOffers] = useState<ServiceOffer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOffer, setSelectedOffer] = useState<ServiceOffer | null>(null);
  const [reviewComments, setReviewComments] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [autoRejectingExpired, setAutoRejectingExpired] = useState(false);

  // Check for admin token on component mount
  useEffect(() => {
    const checkAdminAuth = async () => {
      try {
        // Always verify with server instead of just checking cookie existence
        const response = await fetch('/api/admin/verify', {
          method: 'GET',
          credentials: 'include'
        });

        if (!response.ok) {
          router.push('/admin/login');
          return;
        }

        setIsAdmin(true);
        setIsLoading(false);
      } catch (error) {
        console.error('Admin auth check failed:', error);
        router.push('/admin/login');
      }
    };

    checkAdminAuth();
  }, [router]);

  // Fetch service offers for admin review
  const fetchServiceOffers = async () => {
    try {
      const response = await fetch('/api/admin/service-offers', {
        method: 'GET',
        credentials: 'include' // Send cookies including admin-token
      });

      if (!response.ok) {
        throw new Error('Failed to fetch service offers');
      }

      const data = await response.json();
      setServiceOffers(data.offers || []);
    } catch (error) {
      console.error('Error fetching service offers:', error);
      sonnerToast.error('Failed to load service offers');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch admin settings
  const fetchAdminSettings = async () => {
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'GET',
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        // Admin info loaded successfully
      }
    } catch (error) {
      console.error('Error fetching admin settings:', error);
    }
  };

  // Handle admin logout
  const handleLogout = async () => {
    try {
      // Clear admin session on server
      await fetch('/api/admin/logout', {
        method: 'POST',
        credentials: 'include'
      });
      
      // Clear all local admin state
      setIsAdmin(false);
      setServiceOffers([]);
      setSelectedOffer(null);
      setReviewComments('');
      
      // Force redirect to login
      router.push('/admin/login');
      sonnerToast.success('Logged out successfully');
    } catch (error) {
      console.error('Error logging out:', error);
      // Force redirect even if logout API fails
      setIsAdmin(false);
      router.push('/admin/login');
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchServiceOffers();
      fetchAdminSettings();
      
      // Set up session timeout check every 5 minutes
      const sessionCheck = setInterval(async () => {
        try {
          const response = await fetch('/api/admin/verify', {
            method: 'GET',
            credentials: 'include'
          });
          
          if (!response.ok) {
            sonnerToast.error('Session expired. Please login again.');
            router.push('/admin/login');
          }
        } catch (error) {
          console.error('Session check failed:', error);
          router.push('/admin/login');
        }
      }, 5 * 60 * 1000); // Check every 5 minutes
      
      return () => clearInterval(sessionCheck);
    }
  }, [isAdmin, router]);

  // Handle approval/rejection
  const handleReview = async (offerId: number, action: 'approve' | 'reject') => {
    if (!reviewComments.trim()) {
      sonnerToast.error('Please add review comments');
      return;
    }

    setIsReviewing(true);
    try {
      const response = await fetch(`/api/admin/service-offers/${offerId}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include', // Send cookies including admin-token
        body: JSON.stringify({
          action,
          comments: reviewComments
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to ${action} service offer`);
      }

      sonnerToast.success(`Service offer ${action}d successfully`);
      setSelectedOffer(null);
      setReviewComments('');
      fetchServiceOffers(); // Refresh the list
    } catch (error) {
      console.error(`Error ${action}ing service offer:`, error);
      sonnerToast.error(`Failed to ${action} service offer`);
    } finally {
      setIsReviewing(false);
    }
  };

  // Filter offers based on active tab and search
  const filteredOffers = serviceOffers.filter(offer => {
    const matchesTab = offer.admin_status === activeTab;
    const matchesSearch = searchQuery === '' || 
      offer.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      offer.organization.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      offer.location.city.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesTab && matchesSearch;
  });

  // Calculate days since submission
  const getDaysAgo = (dateString: string) => {
    const diff = Date.now() - new Date(dateString).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  // Calculate remaining time for review deadline
  const getRemainingTime = (submittedDate: string) => {
    const submitted = new Date(submittedDate)
    const deadline = new Date(submitted.getTime() + (5 * 24 * 60 * 60 * 1000)) // 5 days after submission
    const now = new Date()
    const remaining = deadline.getTime() - now.getTime()
    
    if (remaining <= 0) {
      return { expired: true, text: 'EXPIRED', color: 'text-red-600', bgColor: 'bg-red-50' }
    }
    
    const days = Math.floor(remaining / (1000 * 60 * 60 * 24))
    const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60))
    
    if (days > 1) {
      return { 
        expired: false, 
        text: `${days} days left`, 
        color: days >= 3 ? 'text-green-600' : days >= 1 ? 'text-yellow-600' : 'text-red-600',
        bgColor: days >= 3 ? 'bg-green-50' : days >= 1 ? 'bg-yellow-50' : 'bg-red-50'
      }
    } else if (days === 1) {
      return { 
        expired: false, 
        text: `1 day ${hours}h left`, 
        color: 'text-orange-600',
        bgColor: 'bg-orange-50'
      }
    } else {
      return { 
        expired: false, 
        text: `${hours}h ${minutes}m left`, 
        color: 'text-red-600',
        bgColor: 'bg-red-50'
      }
    }
  }

  // Calculate review duration for completed reviews
  const getReviewDuration = (submittedDate: string, reviewedDate: string) => {
    const submitted = new Date(submittedDate)
    const reviewed = new Date(reviewedDate)
    const duration = reviewed.getTime() - submitted.getTime()
    
    const days = Math.floor(duration / (1000 * 60 * 60 * 24))
    const hours = Math.floor((duration % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60))
    
    if (days > 0) {
      return `${days}d ${hours}h`
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`
    } else {
      return `${minutes}m`
    }
  }

  // Auto-reject expired offers
  const autoRejectExpiredOffers = async () => {
    try {
      setAutoRejectingExpired(true)
      const response = await fetch('/api/admin/service-offers/auto-reject', {
        method: 'POST',
        credentials: 'include'
      })
      
      const data = await response.json()
      
      if (data.success) {
        if (data.rejectedCount > 0) {
          sonnerToast.success(`Auto-rejected ${data.rejectedCount} expired offers`)
          fetchServiceOffers() // Refresh the list
        } else {
          sonnerToast.info('No expired offers found')
        }
      }
    } catch (error) {
      console.error('Auto-reject error:', error)
      sonnerToast.error('Failed to auto-reject expired offers')
    } finally {
      setAutoRejectingExpired(false)
    }
  }

  // Get status badge color
  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'pending': return 'secondary';
      case 'approved': return 'default';
      case 'rejected': return 'destructive';
      default: return 'secondary';
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading admin panel...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-gray-600 mt-2">Manage service offers and system settings</p>
          <p className="text-xs text-orange-600 mt-1">⚠️ Session expires in 30 minutes. You'll need to login again.</p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={autoRejectExpiredOffers}
            disabled={autoRejectingExpired}
            variant="outline"
            className="border-red-200 text-red-700 hover:bg-red-50"
          >
            {autoRejectingExpired ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600 mr-2"></div>
                Processing...
              </>
            ) : (
              <>
                <Clock className="h-4 w-4 mr-2" />
                Auto-Reject Expired
              </>
            )}
          </Button>
          <AlertDialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
            <AlertDialogTrigger asChild>
              <Button 
                variant="outline"
                className="flex items-center gap-2"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm Logout</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to logout? You'll need to enter your credentials again to access the admin panel.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleLogout}>
                  Yes, Logout
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-6">
        <Input
          placeholder="Search by title, organization, or location..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-md"
        />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {serviceOffers.filter(o => o.admin_status === 'pending').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {serviceOffers.filter(o => o.admin_status === 'approved').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rejected</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {serviceOffers.filter(o => o.admin_status === 'rejected').length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Service Offers Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="pending">Pending ({serviceOffers.filter(o => o.admin_status === 'pending').length})</TabsTrigger>
          <TabsTrigger value="approved">Approved ({serviceOffers.filter(o => o.admin_status === 'approved').length})</TabsTrigger>
          <TabsTrigger value="rejected">Rejected ({serviceOffers.filter(o => o.admin_status === 'rejected').length})</TabsTrigger>
        </TabsList>

        {['pending', 'approved', 'rejected'].map((status) => (
          <TabsContent key={status} value={status} className="space-y-4">
            {filteredOffers.length === 0 ? (
              <Card>
                <CardContent className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <p className="text-gray-500">No {status} service offers found</p>
                    {searchQuery && (
                      <p className="text-sm text-gray-400 mt-2">Try adjusting your search criteria</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              filteredOffers.map((offer) => (
                <Card key={offer.id} className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-xl">{offer.title}</CardTitle>
                          <Badge variant={getStatusBadgeVariant(offer.admin_status)}>
                            {offer.admin_status}
                          </Badge>
                          {offer.admin_status === 'pending' && (() => {
                            const timeInfo = getRemainingTime(offer.created_at)
                            return (
                              <Badge 
                                variant="outline" 
                                className={`${timeInfo.color} ${timeInfo.bgColor} border-0 font-medium`}
                              >
                                {timeInfo.text}
                              </Badge>
                            )
                          })()}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-600">
                          <div className="flex items-center gap-1">
                            <Users className="h-4 w-4" />
                            {offer.organization.name}
                          </div>
                          <div className="flex items-center gap-1">
                            <MapPin className="h-4 w-4" />
                            {offer.location.city}, {offer.location.state}
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            {new Date(offer.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedOffer(offer)}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        Review
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="line-clamp-2 mb-4">
                      {offer.description}
                    </CardDescription>
                    
                    {/* Duration display for completed reviews */}
                    {offer.admin_status !== 'pending' && offer.admin_reviewed_at && (
                      <div className="mb-3 p-2 bg-gray-50 rounded-md">
                        <span className="text-xs text-gray-500">
                          Review Duration: {getReviewDuration(offer.created_at, offer.admin_reviewed_at)}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1 text-green-600">
                        <DollarSign className="h-4 w-4" />
                        ₹{offer.wage_info.min_amount}-{offer.wage_info.max_amount}/{offer.wage_info.type}
                      </div>
                      <div>
                        <span className="font-medium">Experience:</span> {offer.experience_requirements}
                      </div>
                      <div>
                        <span className="font-medium">Duration:</span> {offer.duration}
                      </div>
                    </div>
                    {offer.admin_comments && (
                      <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-600">
                          <span className="font-medium">Admin Comments:</span> {offer.admin_comments}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Review Dialog */}
      {selectedOffer && (
        <AlertDialog open={!!selectedOffer} onOpenChange={() => setSelectedOffer(null)}>
          <AlertDialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-xl">Review Service Offer</AlertDialogTitle>
              <AlertDialogDescription>
                Review the details below and provide your approval decision.
              </AlertDialogDescription>
            </AlertDialogHeader>
            
            <div className="space-y-6">
              {/* Offer Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold text-lg mb-3">{selectedOffer.title}</h3>
                  <p className="text-gray-600 mb-4">{selectedOffer.description}</p>
                  
                  <div className="space-y-2">
                    <div><span className="font-medium">Organization:</span> {selectedOffer.organization.name}</div>
                    <div><span className="font-medium">Email:</span> {selectedOffer.organization.email}</div>
                    <div><span className="font-medium">Location:</span> {selectedOffer.location.area}, {selectedOffer.location.city}, {selectedOffer.location.state}</div>
                    <div><span className="font-medium">Employment Type:</span> {selectedOffer.employment_type}</div>
                    <div><span className="font-medium">Duration:</span> {selectedOffer.duration}</div>
                  </div>
                </div>
                
                <div>
                  <h4 className="font-semibold mb-3">Compensation & Requirements</h4>
                  <div className="space-y-2">
                    <div>
                      <span className="font-medium">Wage:</span> ₹{selectedOffer.wage_info.min_amount}-{selectedOffer.wage_info.max_amount}/{selectedOffer.wage_info.type}
                    </div>
                    <div>
                      <span className="font-medium">Experience Required:</span> {selectedOffer.experience_requirements}
                    </div>
                    <div>
                      <span className="font-medium">Skills:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {selectedOffer.skills_required.map((skill, index) => (
                          <Badge key={index} variant="outline" className="text-xs">
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="font-medium">Submitted:</span> {new Date(selectedOffer.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Review Comments */}
              {selectedOffer.admin_status === 'pending' && (
                <div>
                  <label htmlFor="review-comments" className="block text-sm font-medium text-gray-700 mb-2">
                    Review Comments *
                  </label>
                  <Textarea
                    id="review-comments"
                    placeholder="Provide detailed feedback about your decision..."
                    value={reviewComments}
                    onChange={(e) => setReviewComments(e.target.value)}
                    rows={4}
                  />
                </div>
              )}

              {selectedOffer.admin_comments && (
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium mb-2">Previous Admin Comments</h4>
                  <p className="text-gray-600">{selectedOffer.admin_comments}</p>
                </div>
              )}
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel>Close</AlertDialogCancel>
              {selectedOffer.admin_status === 'pending' && (
                <>
                  <Button
                    variant="destructive"
                    onClick={() => handleReview(selectedOffer.id, 'reject')}
                    disabled={isReviewing || !reviewComments.trim()}
                  >
                    {isReviewing ? 'Processing...' : 'Reject'}
                  </Button>
                  <Button
                    onClick={() => handleReview(selectedOffer.id, 'approve')}
                    disabled={isReviewing || !reviewComments.trim()}
                  >
                    {isReviewing ? 'Processing...' : 'Approve'}
                  </Button>
                </>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
