'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Building2, Mail, Phone, MapPin, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Textarea } from '@/components/ui/textarea'

export default function NGORegister() {
  const [formData, setFormData] = useState({
    ngoName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    ngoSize: '',
    city: '',
    state: '',
    pincode: '',
    country: 'India',
    description: '',
    mission: '',
    founded: '',
    registrationNumber: ''
  })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  const { signup, error, loading, clearError } = useAuth()
  const router = useRouter()

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    
    // Clear error for this field when user starts typing
    if (formErrors[name]) {
      setFormErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[name]
        return newErrors
      })
    }
  }

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }))
    
    if (formErrors[name]) {
      setFormErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[name]
        return newErrors
      })
    }
  }

  const uploadFileToCloudinary = async (file: File, folder: string = 'ngos') => {
    const formData = new FormData();
    formData.append('file', file);
    
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Authentication required');
    }

    const response = await fetch('/api/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    if (!response.ok) {
      throw new Error('Upload failed');
    }

    const result = await response.json();
    return result.data.url;
  };



  const validateForm = () => {
    const errors: Record<string, string> = {}
    
    if (!formData.ngoName.trim()) {
      errors.ngoName = 'NGO name is required'
    }
    
    if (!formData.email.trim()) {
      errors.email = 'Email is required'
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      errors.email = 'Email is invalid'
    }
    
    if (!formData.phone.trim()) {
      errors.phone = 'Phone number is required'
    } else if (!/^[+]?[1-9]\d{1,14}$/.test(formData.phone.replace(/\s+/g, ''))) {
      errors.phone = 'Please enter a valid phone number'
    }
    
    if (!formData.password) {
      errors.password = 'Password is required'
    } else if (formData.password.length < 8) {
      errors.password = 'Password must be at least 8 characters'
    }
    
    if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match'
    }
    
    if (!formData.ngoSize) {
      errors.ngoSize = 'NGO size is required'
    }
    
    if (!formData.city.trim()) {
      errors.city = 'City is required'
    }
    
    if (!formData.state.trim()) {
      errors.state = 'State/Province is required'
    }
    
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Clear previous errors
    clearError()
    
    // Validate form
    if (!validateForm()) {
      return
    }
    
    try {

      
      // Prepare user data for signup
      const userData = {
        email: formData.email,
        password: formData.password,
        name: formData.ngoName,
        user_type: 'ngo' as const,
        phone: formData.phone,
        city: formData.city,
        state_province: formData.state,
        pincode: formData.pincode,
        country: formData.country,
        profile_data: {
          ngo_name: formData.ngoName,
          ngo_size: formData.ngoSize,
          description: formData.description,
          mission: formData.mission,
          founded: formData.founded,
          registration_number: formData.registrationNumber
        }
      }
      
      // Call signup function from auth context
      await signup(userData)
      
      // If signup is successful, redirect to dashboard
      if (!error) {
        toast.success('NGO account created successfully!');
        router.push('/ngos/dashboard');
      }
    } catch (uploadError) {
      toast.error('Failed to create account. Please try again.');
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-r from-blue-50 to-indigo-50 p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Register as NGO</CardTitle>
          <CardDescription className="text-center">
            Create your NGO account to connect with volunteers and companies
          </CardDescription>
        </CardHeader>
        
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            {/* Basic NGO Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                NGO Information
              </h3>
              
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="ngoName">NGO Name</Label>
                  <Input
                    id="ngoName"
                    name="ngoName"
                    value={formData.ngoName}
                    onChange={handleChange}
                    placeholder="Your NGO Name"
                  />
                  {formErrors.ngoName && <p className="text-sm text-red-500">{formErrors.ngoName}</p>}
                </div>
                
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="ngoSize">NGO Size</Label>
                  <Select value={formData.ngoSize} onValueChange={(value) => handleSelectChange('ngoSize', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select NGO size" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1-10">1-10 members</SelectItem>
                      <SelectItem value="11-50">11-50 members</SelectItem>
                      <SelectItem value="51-200">51-200 members</SelectItem>
                      <SelectItem value="201-500">201-500 members</SelectItem>
                      <SelectItem value="501+">501+ members</SelectItem>
                    </SelectContent>
                  </Select>
                  {formErrors.ngoSize && <p className="text-sm text-red-500">{formErrors.ngoSize}</p>}
                </div>
              </div>
            </div>
            
            {/* Contact Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Contact Information
              </h3>
              
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="ngo@example.com"
                  />
                  {formErrors.email && <p className="text-sm text-red-500">{formErrors.email}</p>}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="+91 9876543210"
                  />
                  {formErrors.phone && <p className="text-sm text-red-500">{formErrors.phone}</p>}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    value={formData.password}
                    onChange={handleChange}
                  />
                  {formErrors.password && <p className="text-sm text-red-500">{formErrors.password}</p>}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                  />
                  {formErrors.confirmPassword && <p className="text-sm text-red-500">{formErrors.confirmPassword}</p>}
                </div>
              </div>
            </div>
            
            {/* NGO Details */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <Users className="h-5 w-5" />
                NGO Details
              </h3>
              
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="description">NGO Description</Label>
                  <Textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    placeholder="Brief description of your NGO's work and objectives"
                    rows={3}
                  />
                </div>
                
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="mission">Mission Statement</Label>
                  <Textarea
                    id="mission"
                    name="mission"
                    value={formData.mission}
                    onChange={handleChange}
                    placeholder="Your NGO's mission and goals"
                    rows={2}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="founded">Year Founded</Label>
                  <Input
                    id="founded"
                    name="founded"
                    type="number"
                    min="1900"
                    max="2025"
                    value={formData.founded}
                    onChange={handleChange}
                    placeholder="2020"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="registrationNumber">Registration Number (Optional)</Label>
                  <Input
                    id="registrationNumber"
                    name="registrationNumber"
                    value={formData.registrationNumber}
                    onChange={handleChange}
                    placeholder="NGO registration number"
                  />
                </div>
              </div>
            </div>
            
            {/* Location Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Location
              </h3>
              
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    placeholder="Mumbai, Delhi, etc."
                  />
                  {formErrors.city && <p className="text-sm text-red-500">{formErrors.city}</p>}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="state">State/Province</Label>
                  <Input
                    id="state"
                    name="state"
                    value={formData.state}
                    onChange={handleChange}
                    placeholder="Maharashtra, Delhi, etc."
                  />
                  {formErrors.state && <p className="text-sm text-red-500">{formErrors.state}</p>}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="pincode">Pincode (Optional)</Label>
                  <Input
                    id="pincode"
                    name="pincode"
                    value={formData.pincode}
                    onChange={handleChange}
                    placeholder="400001"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Select value={formData.country} onValueChange={(value) => handleSelectChange('country', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="India">India</SelectItem>
                      <SelectItem value="Bangladesh">Bangladesh</SelectItem>
                      <SelectItem value="Nepal">Nepal</SelectItem>
                      <SelectItem value="Sri Lanka">Sri Lanka</SelectItem>
                      <SelectItem value="Pakistan">Pakistan</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            

            <div className="flex flex-col space-y-4">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Creating Account...' : 'Create NGO Account'}
              </Button>
              
              <div className="text-center text-sm">
                Already have an account?{' '}
                <Link href="/login" className="font-medium text-primary hover:underline">
                  Sign in
                </Link>
              </div>
            </div>
          </CardContent>
        </form>
      </Card>
    </div>
  )
}