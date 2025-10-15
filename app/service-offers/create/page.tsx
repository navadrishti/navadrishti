'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import ProtectedRoute from '@/components/protected-route'

const categories = [
  'Healthcare & Medical',
  'Education & Training',
  'Food & Nutrition',
  'Legal & Documentation',
  'Financial Services',
  'Housing & Shelter',
  'Transportation',
  'Counseling & Mental Health',
  'Job Training & Employment',
  'Elderly Care',
  'Child Welfare',
  'Disability Support',
  'Emergency Relief',
  'Community Development',
  'Women Empowerment',
  'Environmental Services',
  'General Support Services',
  'Translation & Language',
  'Administrative Services',
  'Other'
];

const availabilityOptions = [
  'Available',
  'Limited Availability',
  'Fully Booked',
  'Seasonal'
];

export default function CreateServiceOfferPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: '',
    location: '',
    availability: 'Available',
    deliveryTime: '',
    pricing: '',
    contactInfo: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      setError('You must be logged in to create a service offer');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      
      const response = await fetch('/api/service-offers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...formData,
          pricing: parseFloat(formData.pricing) || 0
        })
      });

      const data = await response.json();

      if (data.success) {
        router.push('/service-offers');
      } else {
        setError(data.message || 'Failed to create service offer');
      }
    } catch (err) {
      setError('Error creating service offer');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleCategoryChange = (value: string) => {
    setFormData({
      ...formData,
      category: value
    });
  };

  const handleAvailabilityChange = (value: string) => {
    setFormData({
      ...formData,
      availability: value
    });
  };

  return (
    <ProtectedRoute userTypes={['ngo']}>
      <div className="flex min-h-screen flex-col">
        <Header />
        
        <main className="flex-1 px-6 py-8 md:px-10">
          <div className="mb-8">
            <Link href="/service-offers" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4">
              <ArrowLeft size={16} />
              Back to Service Offers
            </Link>
            
            <h1 className="text-3xl font-bold tracking-tight">Create Service Offer</h1>
            <p className="text-muted-foreground">
              Share your NGO's services with the community
            </p>
          </div>

          <div className="max-w-2xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle>Service Details</CardTitle>
                <CardDescription>
                  Provide information about the service your NGO offers
                </CardDescription>
              </CardHeader>
              <CardContent>
                {error && (
                  <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-red-700 text-sm">{error}</p>
                  </div>
                )}
                
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid gap-4">
                    <div>
                      <Label htmlFor="title">Service Title *</Label>
                      <Input
                        id="title"
                        name="title"
                        value={formData.title}
                        onChange={handleChange}
                        placeholder="e.g., Free Computer Training for Women"
                        required
                      />
                    </div>

                    <div>
                      <Label htmlFor="description">Description *</Label>
                      <Textarea
                        id="description"
                        name="description"
                        value={formData.description}
                        onChange={handleChange}
                        placeholder="Describe your service in detail"
                        rows={4}
                        required
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <Label htmlFor="category">Category *</Label>
                        <Select value={formData.category} onValueChange={handleCategoryChange}>
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
                        <Label htmlFor="location">Location *</Label>
                        <Input
                          id="location"
                          name="location"
                          value={formData.location}
                          onChange={handleChange}
                          placeholder="City, State"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <Label htmlFor="availability">Availability</Label>
                        <Select value={formData.availability} onValueChange={handleAvailabilityChange}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select availability" />
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

                      <div>
                        <Label htmlFor="deliveryTime">Service Duration</Label>
                        <Input
                          id="deliveryTime"
                          name="deliveryTime"
                          value={formData.deliveryTime}
                          onChange={handleChange}
                          placeholder="e.g., 2 weeks, 3 months"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="pricing">Cost/Pricing (₹)</Label>
                      <Input
                        id="pricing"
                        name="pricing"
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.pricing}
                        onChange={handleChange}
                        placeholder="0 for free services"
                      />
                      <p className="text-sm text-muted-foreground mt-1">
                        Enter 0 if this is a free service
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="contactInfo">Contact Information</Label>
                      <Textarea
                        id="contactInfo"
                        name="contactInfo"
                        value={formData.contactInfo}
                        onChange={handleChange}
                        placeholder="How should interested parties contact you?"
                        rows={3}
                      />
                    </div>
                  </div>

                  <div className="flex gap-4 pt-6">
                    <Button type="submit" disabled={loading} className="flex-1">
                      {loading ? 'Creating...' : 'Create Service Offer'}
                    </Button>
                    <Button type="button" variant="outline" asChild>
                      <Link href="/service-offers">Cancel</Link>
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}