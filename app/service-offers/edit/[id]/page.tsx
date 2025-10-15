'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/hooks/use-toast'
import Link from 'next/link'

const categories = [
  'Healthcare & Medical',
  'Education & Tutoring',
  'Food & Nutrition',
  'Legal & Documentation',
  'Financial Assistance',
  'Housing & Shelter',
  'Transportation',
  'Counseling & Mental Health',
  'Job Training & Employment',
  'Elderly Care',
  'Child Care',
  'Disability Support',
  'Emergency Relief',
  'Community Outreach',
  'General Support Services',
  'Translation & Language',
  'Administrative Help',
  'Other'
];

const priceTypes = [
  { value: 'free', label: 'Free' },
  { value: 'donation', label: 'Donation Based' },
  { value: 'fixed', label: 'Fixed Price' },
  { value: 'negotiable', label: 'Negotiable' }
];

const availabilityOptions = [
  'Available',
  'Busy',
  'Unavailable',
  'By Appointment'
];

interface ServiceOffer {
  id: number;
  title: string;
  description: string;
  category: string;
  location: string;
  price_type: string;
  price_amount: number;
  requirements: string;
  status: string;
}

export default function EditServiceOfferPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [offer, setOffer] = useState<ServiceOffer | null>(null);
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: '',
    location: '',
    pricing: 0,
    priceType: 'free',
    availability: 'Available',
    deliveryTime: '',
    contactInfo: 'email'
  });

  // Check if user is authorized (NGO only)
  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.user_type !== 'ngo') {
      toast({
        title: "Access Denied",
        description: "Only NGOs can edit service offers",
        variant: "destructive",
      });
      router.push('/service-offers');
      return;
    }
  }, [user, router, toast]);

  // Fetch offer data
  useEffect(() => {
    if (!user || !params.id) return;

    const fetchOffer = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/service-offers/${params.id}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        const data = await response.json();

        if (data.success) {
          const offerData = data.data;
          setOffer(offerData);
          
          // Parse requirements if it exists
          let requirements: any = {};
          try {
            requirements = offerData.requirements ? JSON.parse(offerData.requirements) : {};
          } catch (e) {
            console.error('Error parsing requirements:', e);
          }

          setFormData({
            title: offerData.title || '',
            description: offerData.description || '',
            category: offerData.category || '',
            location: offerData.location || '',
            pricing: offerData.price_amount || 0,
            priceType: offerData.price_type || 'free',
            availability: requirements?.availability || 'Available',
            deliveryTime: requirements?.deliveryTime || '',
            contactInfo: requirements?.contactInfo || 'email'
          });
        } else {
          toast({
            title: "Error",
            description: data.error || "Failed to fetch offer details",
            variant: "destructive",
          });
          router.push('/service-offers');
        }
      } catch (error) {
        console.error('Error fetching offer:', error);
        toast({
          title: "Error",
          description: "Failed to fetch offer details",
          variant: "destructive",
        });
        router.push('/service-offers');
      } finally {
        setLoading(false);
      }
    };

    fetchOffer();
  }, [user, params.id, router, toast]);

  const handleInputChange = (field: string, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title || !formData.description || !formData.category) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/service-offers/${params.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: "Success",
          description: "Service offer updated successfully",
        });
        router.push('/service-offers?view=my-offers');
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to update service offer",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error updating offer:', error);
      toast({
        title: "Error",
        description: "Failed to update service offer",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
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

        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Edit Service Offer</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <Label htmlFor="title">Service Title *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    placeholder="Brief title for your service"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="description">Description *</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    placeholder="Detailed description of your service"
                    rows={4}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="category">Category *</Label>
                    <Select value={formData.category} onValueChange={(value) => handleInputChange('category', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((category) => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="availability">Availability</Label>
                    <Select value={formData.availability} onValueChange={(value) => handleInputChange('availability', value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {availabilityOptions.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    value={formData.location}
                    onChange={(e) => handleInputChange('location', e.target.value)}
                    placeholder="City, area, or specific location"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="priceType">Price Type</Label>
                    <Select value={formData.priceType} onValueChange={(value) => handleInputChange('priceType', value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {priceTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {formData.priceType === 'fixed' && (
                    <div>
                      <Label htmlFor="pricing">Price (₹)</Label>
                      <Input
                        id="pricing"
                        type="number"
                        min="0"
                        value={formData.pricing}
                        onChange={(e) => handleInputChange('pricing', parseFloat(e.target.value) || 0)}
                        placeholder="Enter price"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <Label htmlFor="deliveryTime">Delivery/Response Time</Label>
                  <Input
                    id="deliveryTime"
                    value={formData.deliveryTime}
                    onChange={(e) => handleInputChange('deliveryTime', e.target.value)}
                    placeholder="e.g., 24 hours, 3 days, Same day"
                  />
                </div>

                <div>
                  <Label htmlFor="contactInfo">Contact Preference</Label>
                  <Select value={formData.contactInfo} onValueChange={(value) => handleInputChange('contactInfo', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="phone">Phone</SelectItem>
                      <SelectItem value="both">Email & Phone</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-4 pt-4">
                  <Button 
                    type="submit" 
                    disabled={submitting}
                    className="flex-1"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      'Update Offer'
                    )}
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => router.back()}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}