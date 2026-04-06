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
import { useOtpSender } from '@/hooks/use-otp-sender'

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
    founded: '',
    sector: '',
    registrationDate: '',
    twelveANumber: '',
    eightyGNumber: '',
    csr1RegistrationNumber: '',
    bankDetails: '',
    sectorsScheduleVii: '',
    pastProjects: '',
    geographicCoverage: '',
    executionCapacity: '',
    teamStrength: ''
  })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { otpSending, otpSent, otpCooldown, otpVerifying, otpVerified, handleSendEmailOtp, handleVerifyEmailOtp, resetEmailOtpState } = useOtpSender(setFormErrors)
  const [otpInput, setOtpInput] = useState({ email: '' })

  const { signup, error, clearError } = useAuth()
  const router = useRouter()

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target

    if (name === 'email' && value !== formData.email) {
      resetEmailOtpState()
      setOtpInput(prev => ({ ...prev, email: '' }))
    }

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

    if (!formData.registrationDate) {
      errors.registrationDate = 'Registration date is required'
    }

    if (!formData.twelveANumber.trim()) {
      errors.twelveANumber = '12A number is required'
    }

    if (!formData.eightyGNumber.trim()) {
      errors.eightyGNumber = '80G number is required'
    }

    if (!formData.csr1RegistrationNumber.trim()) {
      errors.csr1RegistrationNumber = 'CSR-1 registration number is required'
    }

    if (!formData.bankDetails.trim()) {
      errors.bankDetails = 'Bank details are required'
    }

    if (!formData.sectorsScheduleVii.trim()) {
      errors.sectorsScheduleVii = 'Sectors worked (Schedule VII mapped) is required'
    }

    if (!formData.pastProjects.trim()) {
      errors.pastProjects = 'Past projects are required'
    }

    if (!formData.geographicCoverage.trim()) {
      errors.geographicCoverage = 'Geographic coverage is required'
    }

    if (!formData.executionCapacity.trim()) {
      errors.executionCapacity = 'Execution capacity is required'
    }

    if (!formData.teamStrength.trim()) {
      errors.teamStrength = 'Team strength is required'
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

    if (!otpSent.email) {
      setFormErrors(prev => ({ ...prev, emailOtp: 'Please send email OTP first' }))
      return
    }

    if (!otpVerified.email && !otpInput.email.trim()) {
      setFormErrors(prev => ({ ...prev, emailOtp: 'Please enter email OTP' }))
      return
    }

    if (!otpVerified.email) {
      const emailOtpVerified = await handleVerifyEmailOtp(formData.email, otpInput.email)
      if (!emailOtpVerified) {
        return
      }
    }
    
    try {
      setIsSubmitting(true)

      
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
          founded: formData.founded,
          sector: formData.sector,
          registration_date: formData.registrationDate,
          twelve_a_number: formData.twelveANumber,
          eighty_g_number: formData.eightyGNumber,
          csr1_registration_number: formData.csr1RegistrationNumber,
          bank_details: formData.bankDetails,
          sectors_schedule_vii: formData.sectorsScheduleVii,
          past_projects: formData.pastProjects,
          geographic_coverage: formData.geographicCoverage,
          execution_capacity: formData.executionCapacity,
          team_strength: formData.teamStrength
        }
      }
      
      // Call signup function from auth context
      await signup(userData)

      toast.success('NGO account created successfully!');
      router.push('/ngos/dashboard');
    } catch {
      // Error state and user notification are handled in auth context
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-r from-blue-50 to-indigo-50 p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="space-y-1">
          <div className="text-sm">
            <Link href="/register" className="font-medium text-primary">
              Back
            </Link>
          </div>
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
                  <div className="flex gap-2">
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="ngo@example.com"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleSendEmailOtp(formData.email)}
                      disabled={otpSending.email || otpCooldown.email > 0}
                    >
                      {otpSending.email ? 'Sending...' : otpCooldown.email > 0 ? `Resend in ${otpCooldown.email}s` : 'Send OTP'}
                    </Button>
                  </div>
                  {formErrors.email && <p className="text-sm text-red-500">{formErrors.email}</p>}
                  {otpSent.email && <p className="text-sm text-green-600">OTP sent to your email</p>}
                  {otpSent.email && (
                    <div className="space-y-2">
                      <Label htmlFor="emailOtp">Email OTP</Label>
                      <div className="flex gap-2">
                        <Input
                          id="emailOtp"
                          name="emailOtp"
                          value={otpInput.email}
                          onChange={(e) => {
                            const value = e.target.value
                            setOtpInput(prev => ({ ...prev, email: value }))
                            if (formErrors.emailOtp) {
                              setFormErrors(prev => {
                                const nextErrors = { ...prev }
                                delete nextErrors.emailOtp
                                return nextErrors
                              })
                            }
                          }}
                          placeholder="Enter email OTP"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => handleVerifyEmailOtp(formData.email, otpInput.email)}
                          disabled={otpVerifying.email}
                        >
                          {otpVerifying.email ? 'Verifying...' : 'Verify OTP'}
                        </Button>
                      </div>
                      {formErrors.emailOtp && <p className="text-sm text-red-500">{formErrors.emailOtp}</p>}
                      {otpVerified.email && <p className="text-sm text-green-600">Email OTP verified</p>}
                    </div>
                  )}
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
                  <Label htmlFor="sector">Sector</Label>
                  <Input
                    id="sector"
                    name="sector"
                    value={formData.sector}
                    onChange={handleChange}
                    placeholder="Education, Healthcare, Environment, etc."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="registrationDate">Registration Date</Label>
                  <Input
                    id="registrationDate"
                    name="registrationDate"
                    type="date"
                    value={formData.registrationDate}
                    onChange={handleChange}
                  />
                  <p className="text-xs text-muted-foreground">Use the date on your registration certificate.</p>
                  {formErrors.registrationDate && <p className="text-sm text-red-500">{formErrors.registrationDate}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="teamStrength">Team Strength</Label>
                  <Input
                    id="teamStrength"
                    name="teamStrength"
                    value={formData.teamStrength}
                    onChange={handleChange}
                    placeholder="e.g. 45 full-time, 120 volunteers"
                  />
                  <p className="text-xs text-muted-foreground">Mention full-time team and active volunteers.</p>
                  {formErrors.teamStrength && <p className="text-sm text-red-500">{formErrors.teamStrength}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="twelveANumber">12A Number</Label>
                  <Input
                    id="twelveANumber"
                    name="twelveANumber"
                    value={formData.twelveANumber}
                    onChange={handleChange}
                    placeholder="Enter 12A number"
                  />
                  <p className="text-xs text-muted-foreground">Enter the approval/reference number issued under section 12A/12AB.</p>
                  {formErrors.twelveANumber && <p className="text-sm text-red-500">{formErrors.twelveANumber}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="eightyGNumber">80G Number</Label>
                  <Input
                    id="eightyGNumber"
                    name="eightyGNumber"
                    value={formData.eightyGNumber}
                    onChange={handleChange}
                    placeholder="Enter 80G number"
                  />
                  <p className="text-xs text-muted-foreground">Use the exemption certificate reference under section 80G.</p>
                  {formErrors.eightyGNumber && <p className="text-sm text-red-500">{formErrors.eightyGNumber}</p>}
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="csr1RegistrationNumber">CSR-1 Registration Number</Label>
                  <Input
                    id="csr1RegistrationNumber"
                    name="csr1RegistrationNumber"
                    value={formData.csr1RegistrationNumber}
                    onChange={handleChange}
                    placeholder="Enter CSR-1 registration number"
                  />
                  <p className="text-xs text-muted-foreground">Provide the CSR-1 acknowledgment or registration reference.</p>
                  {formErrors.csr1RegistrationNumber && <p className="text-sm text-red-500">{formErrors.csr1RegistrationNumber}</p>}
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="bankDetails">Bank Details</Label>
                  <Textarea
                    id="bankDetails"
                    name="bankDetails"
                    value={formData.bankDetails}
                    onChange={handleChange}
                    placeholder="Provide account holder name, bank name, branch, account number (masked where needed), and IFSC"
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">Include account holder, bank/branch, account number, and IFSC.</p>
                  {formErrors.bankDetails && <p className="text-sm text-red-500">{formErrors.bankDetails}</p>}
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="sectorsScheduleVii">Sectors Worked (Schedule VII Mapped)</Label>
                  <Textarea
                    id="sectorsScheduleVii"
                    name="sectorsScheduleVii"
                    value={formData.sectorsScheduleVii}
                    onChange={handleChange}
                    placeholder="List sectors and map them to Schedule VII categories"
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">Example: education (ii), healthcare (i), rural development (x).</p>
                  {formErrors.sectorsScheduleVii && <p className="text-sm text-red-500">{formErrors.sectorsScheduleVii}</p>}
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="pastProjects">Past Projects</Label>
                  <Textarea
                    id="pastProjects"
                    name="pastProjects"
                    value={formData.pastProjects}
                    onChange={handleChange}
                    placeholder="Summarize key completed projects with outcomes"
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">Mention project name, location, period, and measurable outcomes.</p>
                  {formErrors.pastProjects && <p className="text-sm text-red-500">{formErrors.pastProjects}</p>}
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="geographicCoverage">Geographic Coverage</Label>
                  <Textarea
                    id="geographicCoverage"
                    name="geographicCoverage"
                    value={formData.geographicCoverage}
                    onChange={handleChange}
                    placeholder="Mention states, districts, or regions where you operate"
                    rows={2}
                  />
                  <p className="text-xs text-muted-foreground">List states/districts and whether operations are urban, rural, or both.</p>
                  {formErrors.geographicCoverage && <p className="text-sm text-red-500">{formErrors.geographicCoverage}</p>}
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="executionCapacity">Execution Capacity</Label>
                  <Textarea
                    id="executionCapacity"
                    name="executionCapacity"
                    value={formData.executionCapacity}
                    onChange={handleChange}
                    placeholder="Describe operational capacity, delivery model, and partner ecosystem"
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">Include implementation bandwidth, partner network, and reporting capability.</p>
                  {formErrors.executionCapacity && <p className="text-sm text-red-500">{formErrors.executionCapacity}</p>}
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
                  <Label htmlFor="pincode">Pincode</Label>
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
              <Button type="submit" className="w-full" disabled={isSubmitting || !otpVerified.email}>
                {isSubmitting ? 'Creating Account...' : 'Create NGO Account'}
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