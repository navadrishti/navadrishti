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
import { toast } from 'sonner'
import { useOtpSender } from '@/hooks/use-otp-sender'
import { Textarea } from '@/components/ui/textarea'
import { MultiSelectDropdown } from '@/components/ui/multi-select-dropdown'
import { AuthCardBackRow } from '@/components/header'
import {
  CSR_SCHEDULE_VII_CATEGORIES,
  COMPANY_CSR_GOVERNANCE_MECHANISMS,
  COMPANY_CSR_IMPLEMENTATION_MODELS,
} from '@/lib/categories'
import {
  INDIAN_STATES_AND_UTS,
  buildNgoLocationDisplay,
  normalizePincode,
  validateCompanyHeadquartersLocation,
} from '@/lib/auth'

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
    addressLine: '',
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
    focusAreasScheduleVii: [] as string[],
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

    const locationError = validateCompanyHeadquartersLocation({
      address_line: formData.addressLine,
      city: formData.city,
      state: formData.state,
      pincode: formData.pincode,
      country: formData.country,
    })
    if (locationError) {
      if (!formData.addressLine.trim()) {
        errors.addressLine = 'Registered office address is required'
      }
      if (!formData.city.trim()) {
        errors.city = 'City is required'
      }
      if (!formData.state.trim()) {
        errors.state = 'State / UT is required'
      }
      if (!formData.pincode.trim()) {
        errors.pincode = 'Pincode is required'
      } else if (formData.country === 'India' && !/^\d{6}$/.test(normalizePincode(formData.pincode, 'India'))) {
        errors.pincode = 'Enter a valid 6-digit pincode'
      } else if (locationError.includes('state or UT')) {
        errors.state = 'Select a valid Indian state or UT'
      }
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

      const headquarters = {
        address_line: formData.addressLine.trim(),
        city: formData.city.trim(),
        state: formData.state.trim(),
        pincode: normalizePincode(formData.pincode, formData.country),
        country: formData.country,
      }

      const profileData: Record<string, unknown> = {
        company_name: formData.companyName,
        industry: formData.industry,
        company_size: formData.companySize,
        company_headquarters: headquarters,
      }

      if (formData.website.trim()) profileData.website = formData.website.trim()
      if (formData.founded) profileData.founded = parseInt(formData.founded)
      if (formData.sector.trim()) profileData.sector = formData.sector.trim()
      if (formData.netWorth.trim()) profileData.net_worth = formData.netWorth.trim()
      if (formData.turnover.trim()) profileData.turnover = formData.turnover.trim()
      if (formData.netProfit.trim()) profileData.net_profit = formData.netProfit.trim()
      if (formData.csrVision.trim()) profileData.csr_vision = formData.csrVision.trim()
      if (formData.focusAreasScheduleVii.length > 0) {
        profileData.focus_areas_schedule_vii = formData.focusAreasScheduleVii
      }
      if (formData.implementationModel) profileData.implementation_model = formData.implementationModel
      if (formData.governanceMechanism) profileData.governance_mechanism = formData.governanceMechanism

      const userData = {
        email: formData.email,
        password: formData.password,
        name: formData.companyName,
        user_type: 'company' as const,
        phone: formData.phone.trim(),
        city: headquarters.city,
        state_province: headquarters.state,
        pincode: headquarters.pincode,
        country: headquarters.country,
        location: buildNgoLocationDisplay(headquarters),
        profile_data: profileData,
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-[#F6F5F1] to-[#FFF6ED] p-4">
      <Card className="w-full max-w-2xl shadow-none">
        <CardHeader className="space-y-1">
          <AuthCardBackRow fallbackHref="/register" />
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
              <h3 className="text-lg font-medium">Company Information</h3>
              
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
              <h3 className="text-lg font-medium">Contact Information</h3>
              
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
              <h3 className="text-lg font-medium">Company Details</h3>

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
              </div>
            </div>

            {/* CSR Program Details */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium">CSR Program Details</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Optional details that help with CSR matching. You can add or update these later from your profile.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="focusAreasScheduleVii">
                    Focus Areas (Schedule VII){' '}
                    <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <MultiSelectDropdown
                    value={formData.focusAreasScheduleVii}
                    options={CSR_SCHEDULE_VII_CATEGORIES}
                    placeholder="Select Schedule VII focus areas"
                    onValueChange={(value) => {
                      setFormData((prev) => ({ ...prev, focusAreasScheduleVii: value }))
                      if (formErrors.focusAreasScheduleVii) {
                        setFormErrors((prev) => {
                          const next = { ...prev }
                          delete next.focusAreasScheduleVii
                          return next
                        })
                      }
                    }}
                  />
                  <p className="text-xs text-muted-foreground">Choose all Schedule VII areas your CSR programs focus on.</p>
                  {formErrors.focusAreasScheduleVii && (
                    <p className="text-sm text-red-500">{formErrors.focusAreasScheduleVii}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="implementationModel">
                    Implementation Model{' '}
                    <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <Select
                    value={formData.implementationModel || 'unset'}
                    onValueChange={(value) => {
                      handleSelectChange('implementationModel', value === 'unset' ? '' : value)
                    }}
                  >
                    <SelectTrigger id="implementationModel">
                      <SelectValue placeholder="Select implementation model" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unset">Select implementation model</SelectItem>
                      {COMPANY_CSR_IMPLEMENTATION_MODELS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {formErrors.implementationModel && (
                    <p className="text-sm text-red-500">{formErrors.implementationModel}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="governanceMechanism">
                    Governance Mechanism{' '}
                    <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <Select
                    value={formData.governanceMechanism || 'unset'}
                    onValueChange={(value) => {
                      handleSelectChange('governanceMechanism', value === 'unset' ? '' : value)
                    }}
                  >
                    <SelectTrigger id="governanceMechanism">
                      <SelectValue placeholder="Select governance mechanism" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unset">Select governance mechanism</SelectItem>
                      {COMPANY_CSR_GOVERNANCE_MECHANISMS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {formErrors.governanceMechanism && (
                    <p className="text-sm text-red-500">{formErrors.governanceMechanism}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="netWorth">
                    Net Worth <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id="netWorth"
                    name="netWorth"
                    value={formData.netWorth}
                    onChange={handleChange}
                    placeholder="e.g. INR 120 Cr"
                  />
                  <p className="text-xs text-muted-foreground">Use latest audited financial year figures.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="turnover">
                    Turnover <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id="turnover"
                    name="turnover"
                    value={formData.turnover}
                    onChange={handleChange}
                    placeholder="e.g. INR 450 Cr"
                  />
                  <p className="text-xs text-muted-foreground">Enter annual turnover from latest audited statements.</p>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="netProfit">
                    Net Profit <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id="netProfit"
                    name="netProfit"
                    value={formData.netProfit}
                    onChange={handleChange}
                    placeholder="e.g. INR 35 Cr"
                  />
                  <p className="text-xs text-muted-foreground">Provide post-tax net profit for the latest financial year.</p>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="csrVision">
                    CSR Vision <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <Textarea
                    id="csrVision"
                    name="csrVision"
                    value={formData.csrVision}
                    onChange={handleChange}
                    placeholder="Describe your long-term CSR vision"
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">Keep it concise: long-term impact goals and intended beneficiaries.</p>
                </div>
              </div>
            </div>

            {/* Company Location */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium">Company Location</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Enter your registered office or primary company headquarters. We use this for CSR matching and regional recommendations.
                </p>
              </div>

              <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                <div className="space-y-2">
                  <Label htmlFor="addressLine">Registered office address</Label>
                  <Textarea
                    id="addressLine"
                    name="addressLine"
                    value={formData.addressLine}
                    onChange={handleChange}
                    placeholder="Building, street, locality"
                    rows={2}
                  />
                  {formErrors.addressLine && <p className="text-sm text-red-500">{formErrors.addressLine}</p>}
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="city">City / Town</Label>
                    <Input
                      id="city"
                      name="city"
                      value={formData.city}
                      onChange={handleChange}
                      placeholder="e.g. Pune, Mumbai"
                    />
                    {formErrors.city && <p className="text-sm text-red-500">{formErrors.city}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="country">Country</Label>
                    <Select
                      value={formData.country}
                      onValueChange={(value) => {
                        handleSelectChange('country', value)
                        if (value !== 'India') {
                          setFormData((prev) => ({ ...prev, state: '' }))
                        }
                      }}
                    >
                      <SelectTrigger id="country">
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

                  {formData.country === 'India' ? (
                    <div className="space-y-2">
                      <Label htmlFor="state">State / UT</Label>
                      <Select
                        value={formData.state || 'unset'}
                        onValueChange={(value) => handleSelectChange('state', value === 'unset' ? '' : value)}
                      >
                        <SelectTrigger id="state">
                          <SelectValue placeholder="Select state or UT" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unset">Select state / UT</SelectItem>
                          {INDIAN_STATES_AND_UTS.map((stateName) => (
                            <SelectItem key={stateName} value={stateName}>
                              {stateName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {formErrors.state && <p className="text-sm text-red-500">{formErrors.state}</p>}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="state">State / Province</Label>
                      <Input
                        id="state"
                        name="state"
                        value={formData.state}
                        onChange={handleChange}
                        placeholder="State or province"
                      />
                      {formErrors.state && <p className="text-sm text-red-500">{formErrors.state}</p>}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="pincode">Pincode</Label>
                    <Input
                      id="pincode"
                      name="pincode"
                      value={formData.pincode}
                      onChange={handleChange}
                      placeholder={formData.country === 'India' ? '6-digit pincode' : 'Postal code'}
                      inputMode="numeric"
                    />
                    {formErrors.pincode && <p className="text-sm text-red-500">{formErrors.pincode}</p>}
                  </div>
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