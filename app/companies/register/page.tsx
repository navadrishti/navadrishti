"use client"

import { useState, FormEvent } from "react"
import Link from "next/link"
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Building, Mail, Phone, Globe, MapPin, Users, Briefcase } from "lucide-react"
import { toast } from 'sonner'
import { useOtpSender } from '@/hooks/use-otp-sender'
import { Textarea } from '@/components/ui/textarea'

export default function CompanyRegistration() {
  const [formData, setFormData] = useState({
    companyName: '',
    industry: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    companySize: '',
    website: '',
    city: '',
    state: '',
    pincode: '',
    country: 'India',
    founded: '',
    sector: '',
    netWorth: '',
    turnover: '',
    netProfit: '',
    csrVision: '',
    focusAreasScheduleVii: '',
    implementationModel: '',
    governanceMechanism: ''
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

  const validateForm = () => {
    const errors: Record<string, string> = {}
    
    if (!formData.companyName.trim()) {
      errors.companyName = 'Company name is required'
    }
    
    if (!formData.industry) {
      errors.industry = 'Industry is required'
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
    
    if (!formData.companySize) {
      errors.companySize = 'Company size is required'
    }
    
    if (!formData.city.trim()) {
      errors.city = 'City is required'
    }
    
    if (!formData.state.trim()) {
      errors.state = 'State/Province is required'
    }

    if (!formData.netWorth.trim()) {
      errors.netWorth = 'Net worth is required'
    }

    if (!formData.turnover.trim()) {
      errors.turnover = 'Turnover is required'
    }

    if (!formData.netProfit.trim()) {
      errors.netProfit = 'Net profit is required'
    }

    if (!formData.csrVision.trim()) {
      errors.csrVision = 'CSR vision is required'
    }

    if (!formData.focusAreasScheduleVii.trim()) {
      errors.focusAreasScheduleVii = 'Focus areas (Schedule VII mapped) are required'
    }

    if (!formData.implementationModel.trim()) {
      errors.implementationModel = 'Implementation model is required'
    }

    if (!formData.governanceMechanism.trim()) {
      errors.governanceMechanism = 'Governance mechanism is required'
    }
    
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const uploadFileToCloudinary = async (file: File, folder: string = 'companies') => {
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



  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
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
        name: formData.companyName,
        user_type: 'company' as const,
        phone: formData.phone,
        city: formData.city,
        state_province: formData.state,
        pincode: formData.pincode,
        country: formData.country,
        profile_data: {
          company_name: formData.companyName,
          industry: formData.industry,
          company_size: formData.companySize,
          website: formData.website,
          founded: formData.founded,
          sector: formData.sector,
          net_worth: formData.netWorth,
          turnover: formData.turnover,
          net_profit: formData.netProfit,
          csr_vision: formData.csrVision,
          focus_areas_schedule_vii: formData.focusAreasScheduleVii,
          implementation_model: formData.implementationModel,
          governance_mechanism: formData.governanceMechanism
        }
      }
      
      // Call signup function from auth context
      await signup(userData)

      toast.success('Company account created successfully!');
      router.push('/companies/dashboard');
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
          <CardTitle className="text-2xl font-bold text-center">Register as Company</CardTitle>
          <CardDescription className="text-center">
            Create your company account to connect with NGOs and skilled individuals
          </CardDescription>
        </CardHeader>
        
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            {/* Basic Company Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <Building className="h-5 w-5" />
                Company Information
              </h3>
              
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="companyName">Company Name</Label>
                  <Input
                    id="companyName"
                    name="companyName"
                    value={formData.companyName}
                    onChange={handleChange}
                    placeholder="Your Company Name"
                  />
                  {formErrors.companyName && <p className="text-sm text-red-500">{formErrors.companyName}</p>}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="industry">Industry</Label>
                  <Select value={formData.industry} onValueChange={(value) => handleSelectChange('industry', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select industry" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="technology">Technology</SelectItem>
                      <SelectItem value="healthcare">Healthcare</SelectItem>
                      <SelectItem value="education">Education</SelectItem>
                      <SelectItem value="manufacturing">Manufacturing</SelectItem>
                      <SelectItem value="finance">Finance & Banking</SelectItem>
                      <SelectItem value="retail">Retail</SelectItem>
                      <SelectItem value="consulting">Consulting</SelectItem>
                      <SelectItem value="media">Media & Entertainment</SelectItem>
                      <SelectItem value="energy">Energy</SelectItem>
                      <SelectItem value="ecommerce">E-commerce</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  {formErrors.industry && <p className="text-sm text-red-500">{formErrors.industry}</p>}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="companySize">Company Size</Label>
                  <Select value={formData.companySize} onValueChange={(value) => handleSelectChange('companySize', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select company size" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1-10">1-10 employees</SelectItem>
                      <SelectItem value="11-50">11-50 employees</SelectItem>
                      <SelectItem value="51-200">51-200 employees</SelectItem>
                      <SelectItem value="201-500">201-500 employees</SelectItem>
                      <SelectItem value="501-1000">501-1000 employees</SelectItem>
                      <SelectItem value="1001+">1001+ employees</SelectItem>
                    </SelectContent>
                  </Select>
                  {formErrors.companySize && <p className="text-sm text-red-500">{formErrors.companySize}</p>}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  name="website"
                  type="url"
                  value={formData.website}
                  onChange={handleChange}
                  placeholder="https://www.yourcompany.com"
                />
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
                      placeholder="company@example.com"
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
                          disabled={otpVerifying.email || otpVerified.email}
                        >
                          {otpVerifying.email ? 'Verifying...' : otpVerified.email ? 'Verified' : 'Verify OTP'}
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
            
            {/* Company Details */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <Briefcase className="h-5 w-5" />
                Company Details
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
                    placeholder="IT, Finance, Manufacturing, etc."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="netWorth">Net Worth</Label>
                  <Input
                    id="netWorth"
                    name="netWorth"
                    value={formData.netWorth}
                    onChange={handleChange}
                    placeholder="e.g. INR 120 Cr"
                  />
                  <p className="text-xs text-muted-foreground">Use latest audited financial year figures.</p>
                  {formErrors.netWorth && <p className="text-sm text-red-500">{formErrors.netWorth}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="turnover">Turnover</Label>
                  <Input
                    id="turnover"
                    name="turnover"
                    value={formData.turnover}
                    onChange={handleChange}
                    placeholder="e.g. INR 450 Cr"
                  />
                  <p className="text-xs text-muted-foreground">Enter annual turnover from latest audited statements.</p>
                  {formErrors.turnover && <p className="text-sm text-red-500">{formErrors.turnover}</p>}
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="netProfit">Net Profit</Label>
                  <Input
                    id="netProfit"
                    name="netProfit"
                    value={formData.netProfit}
                    onChange={handleChange}
                    placeholder="e.g. INR 35 Cr"
                  />
                  <p className="text-xs text-muted-foreground">Provide post-tax net profit for the latest financial year.</p>
                  {formErrors.netProfit && <p className="text-sm text-red-500">{formErrors.netProfit}</p>}
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="csrVision">CSR Vision</Label>
                  <Textarea
                    id="csrVision"
                    name="csrVision"
                    value={formData.csrVision}
                    onChange={handleChange}
                    placeholder="Describe your long-term CSR vision"
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">Keep it concise: long-term impact goals and intended beneficiaries.</p>
                  {formErrors.csrVision && <p className="text-sm text-red-500">{formErrors.csrVision}</p>}
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="focusAreasScheduleVii">Focus Areas (Schedule VII Mapped)</Label>
                  <Textarea
                    id="focusAreasScheduleVii"
                    name="focusAreasScheduleVii"
                    value={formData.focusAreasScheduleVii}
                    onChange={handleChange}
                    placeholder="List focus areas and map to Schedule VII categories"
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">Example: education (ii), healthcare (i), environment (iv).</p>
                  {formErrors.focusAreasScheduleVii && <p className="text-sm text-red-500">{formErrors.focusAreasScheduleVii}</p>}
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="implementationModel">Implementation Model</Label>
                  <Textarea
                    id="implementationModel"
                    name="implementationModel"
                    value={formData.implementationModel}
                    onChange={handleChange}
                    placeholder="Direct implementation, NGO partners, hybrid model, etc."
                    rows={2}
                  />
                  <p className="text-xs text-muted-foreground">State whether delivery is direct, partner-led, or hybrid.</p>
                  {formErrors.implementationModel && <p className="text-sm text-red-500">{formErrors.implementationModel}</p>}
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="governanceMechanism">Governance Mechanism</Label>
                  <Textarea
                    id="governanceMechanism"
                    name="governanceMechanism"
                    value={formData.governanceMechanism}
                    onChange={handleChange}
                    placeholder="Describe CSR governance, approval, and monitoring mechanisms"
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">Include committee structure, approvals, and monitoring/reporting cadence.</p>
                  {formErrors.governanceMechanism && <p className="text-sm text-red-500">{formErrors.governanceMechanism}</p>}
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
                {isSubmitting ? 'Creating Account...' : 'Create Company Account'}
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