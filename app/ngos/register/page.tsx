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
import { toast } from 'sonner'
import { Textarea } from '@/components/ui/textarea'
import { MultiSelectDropdown } from '@/components/ui/multi-select-dropdown'
import { CSR_SCHEDULE_VII_CATEGORIES } from '@/lib/categories'
import {
  EMPTY_EXECUTION_CAPACITY,
  EMPTY_GEOGRAPHIC_COVERAGE_AREA,
  EMPTY_PAST_PROJECT,
  INDIAN_STATES_AND_UTS,
  buildNgoLocationDisplay,
  normalizePincode,
  validateNgoHeadquartersLocation,
  type NgoExecutionCapacity,
  type NgoGeographicCoverageArea,
  type NgoPastProject,
} from '@/lib/auth'
import { useOtpSender } from '@/hooks/use-otp-sender'
import { AuthCardBackRow } from '@/components/header'

export default function NGORegister() {
  const [formData, setFormData] = useState({
    ngoName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    ngoVolunteerCapacity: '',
    addressLine: '',
    city: '',
    state: '',
    pincode: '',
    country: 'India',
    founded: '',
    sector: '',
    registrationDate: '',
    sectorsScheduleVii: [] as string[],
    pastProjects: [{ ...EMPTY_PAST_PROJECT }] as NgoPastProject[],
    geographicCoverageAreas: [{ ...EMPTY_GEOGRAPHIC_COVERAGE_AREA }] as NgoGeographicCoverageArea[],
    executionCapacity: { ...EMPTY_EXECUTION_CAPACITY } as NgoExecutionCapacity,
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

  const updatePastProject = (index: number, field: keyof NgoPastProject, value: string) => {
    setFormData((prev) => ({
      ...prev,
      pastProjects: prev.pastProjects.map((project, projectIndex) =>
        projectIndex === index ? { ...project, [field]: value } : project
      ),
    }))
  }

  const addPastProject = () => {
    setFormData((prev) => ({
      ...prev,
      pastProjects: [...prev.pastProjects, { ...EMPTY_PAST_PROJECT }],
    }))
  }

  const removePastProject = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      pastProjects:
        prev.pastProjects.length === 1
          ? [{ ...EMPTY_PAST_PROJECT }]
          : prev.pastProjects.filter((_, projectIndex) => projectIndex !== index),
    }))
  }

  const updateGeographicArea = (
    index: number,
    field: keyof NgoGeographicCoverageArea,
    value: string
  ) => {
    setFormData((prev) => ({
      ...prev,
      geographicCoverageAreas: prev.geographicCoverageAreas.map((area, areaIndex) =>
        areaIndex === index ? { ...area, [field]: value } : area
      ),
    }))
  }

  const addGeographicArea = () => {
    setFormData((prev) => ({
      ...prev,
      geographicCoverageAreas: [...prev.geographicCoverageAreas, { ...EMPTY_GEOGRAPHIC_COVERAGE_AREA }],
    }))
  }

  const removeGeographicArea = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      geographicCoverageAreas:
        prev.geographicCoverageAreas.length === 1
          ? [{ ...EMPTY_GEOGRAPHIC_COVERAGE_AREA }]
          : prev.geographicCoverageAreas.filter((_, areaIndex) => areaIndex !== index),
    }))
  }

  const updateExecutionCapacity = (
    field: keyof NgoExecutionCapacity,
    value: string
  ) => {
    setFormData((prev) => ({
      ...prev,
      executionCapacity: {
        ...prev.executionCapacity,
        [field]: value,
      },
    }))
  }

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
    
    if (!formData.ngoVolunteerCapacity) {
      errors.ngoVolunteerCapacity = 'Exact NGO size is required'
    } else if (!/^[0-9]+$/.test(String(formData.ngoVolunteerCapacity).trim())) {
      errors.ngoVolunteerCapacity = 'Please enter a valid whole number for NGO size'
    }
    
    if (!formData.city.trim()) {
      errors.city = 'City is required'
    }

    const locationError = validateNgoHeadquartersLocation({
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

    if (!formData.registrationDate) {
      errors.registrationDate = 'Registration date is required'
    }

    if (formData.sectorsScheduleVii.length === 0) {
      errors.sectorsScheduleVii = 'Select at least one Schedule VII sector'
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

      const normalizedPastProjects = formData.pastProjects
        .map((project) => ({
          title: project.title.trim(),
          description: project.description.trim(),
        }))
        .filter((project) => project.title)

      const normalizedGeographicCoverage = formData.geographicCoverageAreas
        .map((area) => ({
          region: area.region.trim(),
          state: area.state.trim(),
          district: area.district.trim(),
          area_type: area.area_type,
        }))
        .filter((area) => area.state || area.region || area.district)

      const normalizedExecutionCapacity = {
        concurrent_projects: formData.executionCapacity.concurrent_projects.trim(),
        annual_beneficiaries: formData.executionCapacity.annual_beneficiaries.trim(),
        delivery_model: formData.executionCapacity.delivery_model,
        notes: formData.executionCapacity.notes.trim(),
      }
      const hasExecutionCapacity = Boolean(
        normalizedExecutionCapacity.concurrent_projects ||
          normalizedExecutionCapacity.annual_beneficiaries ||
          normalizedExecutionCapacity.delivery_model ||
          normalizedExecutionCapacity.notes
      )

      const headquarters = {
        address_line: formData.addressLine.trim(),
        city: formData.city.trim(),
        state: formData.state.trim(),
        pincode: normalizePincode(formData.pincode, formData.country),
        country: formData.country,
      }

      // Prepare user data for signup
      const userData = {
        email: formData.email,
        password: formData.password,
        name: formData.ngoName,
        user_type: 'ngo' as const,
        phone: formData.phone.trim(),
        city: headquarters.city,
        state_province: headquarters.state,
        pincode: headquarters.pincode,
        country: headquarters.country,
        location: buildNgoLocationDisplay(headquarters),
        // exact capacity stored at top-level so DB column `ngo_volunteer_capacity` is set
        ngo_volunteer_capacity: formData.ngoVolunteerCapacity ? Number(String(formData.ngoVolunteerCapacity).replace(/[^0-9]/g, '')) : undefined,
        profile_data: {
          ngo_name: formData.ngoName,
          founded: formData.founded,
          sector: formData.sectorsScheduleVii[0] || '',
          registration_date: formData.registrationDate,
          sectors_schedule_vii: formData.sectorsScheduleVii,
          past_projects: normalizedPastProjects.length > 0 ? normalizedPastProjects : undefined,
          geographic_coverage:
            normalizedGeographicCoverage.length > 0 ? normalizedGeographicCoverage : undefined,
          execution_capacity: hasExecutionCapacity ? normalizedExecutionCapacity : undefined,
          ngo_headquarters: headquarters,
          team_strength: String(formData.ngoVolunteerCapacity).trim(),
          ngo_volunteer_capacity: formData.ngoVolunteerCapacity
            ? Number(String(formData.ngoVolunteerCapacity).replace(/[^0-9]/g, ''))
            : undefined,
        }
      }
      
      // Call signup function from auth context
      await signup(userData)

      toast.success('NGO account created successfully!');
      router.push('/ngos/dashboard');
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Registration failed'
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-[#F6F5F1] to-[#FFF6ED] p-4">
      <Card className="w-full max-w-2xl shadow-none">
        <CardHeader className="space-y-1">
          <AuthCardBackRow fallbackHref="/register" />
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
              <h3 className="text-lg font-medium">NGO Information</h3>
              
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
                    placeholder="At least 8 characters"
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
                    placeholder="Re-enter your password"
                  />
                  {formErrors.confirmPassword && <p className="text-sm text-red-500">{formErrors.confirmPassword}</p>}
                </div>
              </div>
            </div>
            
            {/* NGO Details */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">NGO Details</h3>
              
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

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="ngoVolunteerCapacity">Exact NGO size</Label>
                  <div className="flex gap-2">
                    <Input
                      id="ngoVolunteerCapacity"
                      name="ngoVolunteerCapacity"
                      value={formData.ngoVolunteerCapacity}
                      onChange={handleChange}
                      placeholder="Enter total staff/active volunteers (e.g. 42)"
                      inputMode="numeric"
                    />
                    <span className="text-sm text-gray-600 self-center">people</span>
                  </div>
                  {formErrors.ngoVolunteerCapacity && <p className="text-sm text-red-500">{formErrors.ngoVolunteerCapacity}</p>}
                </div>
              </div>
            </div>

            {/* Program Details */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Program Details</h3>
              <p className="text-sm text-muted-foreground">
                Schedule VII sectors are required. Other program details can be added now or updated later from your profile.
              </p>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="sectorsScheduleVii">Sectors Worked (Schedule VII)</Label>
                  <MultiSelectDropdown
                    value={formData.sectorsScheduleVii}
                    options={CSR_SCHEDULE_VII_CATEGORIES}
                    placeholder="Select Schedule VII sectors"
                    onValueChange={(value) => {
                      setFormData((prev) => ({ ...prev, sectorsScheduleVii: value }))
                      if (formErrors.sectorsScheduleVii) {
                        setFormErrors((prev) => {
                          const next = { ...prev }
                          delete next.sectorsScheduleVii
                          return next
                        })
                      }
                    }}
                  />
                  <p className="text-xs text-muted-foreground">Choose all Schedule VII areas your NGO works in.</p>
                  {formErrors.sectorsScheduleVii && <p className="text-sm text-red-500">{formErrors.sectorsScheduleVii}</p>}
                </div>

                <div className="space-y-3 md:col-span-2">
                  <div>
                    <Label>Past Projects <span className="text-muted-foreground font-normal">(optional)</span></Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Add pre-platform project history here only once. After you join, new projects you run on GRAM are added automatically.
                    </p>
                  </div>

                  {formData.pastProjects.map((project, index) => (
                    <div key={`past-project-${index}`} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-slate-900">Project {index + 1}</p>
                        {formData.pastProjects.length > 1 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-red-600 hover:text-red-700"
                            onClick={() => removePastProject(index)}
                          >
                            Remove
                          </Button>
                        ) : null}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`pastProjectTitle-${index}`}>Project title</Label>
                        <Input
                          id={`pastProjectTitle-${index}`}
                          value={project.title}
                          onChange={(e) => updatePastProject(index, 'title', e.target.value)}
                          placeholder="e.g. Rural health camp 2023"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`pastProjectDescription-${index}`}>
                          Description / outcomes <span className="text-muted-foreground font-normal">(optional)</span>
                        </Label>
                        <Textarea
                          id={`pastProjectDescription-${index}`}
                          value={project.description}
                          onChange={(e) => updatePastProject(index, 'description', e.target.value)}
                          placeholder="Location, period, beneficiaries, and measurable outcomes"
                          rows={2}
                        />
                      </div>
                    </div>
                  ))}

                  <Button type="button" variant="outline" size="sm" onClick={addPastProject}>
                    Add another project
                  </Button>
                </div>

                <div className="space-y-3 md:col-span-2">
                  <div>
                    <Label>
                      Geographic Coverage <span className="text-muted-foreground font-normal">(optional)</span>
                    </Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Add each region where you operate with state, district, and area type.
                    </p>
                  </div>

                  {formData.geographicCoverageAreas.map((area, index) => (
                    <div
                      key={`geographic-area-${index}`}
                      className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-slate-900">Coverage area {index + 1}</p>
                        {formData.geographicCoverageAreas.length > 1 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-red-600 hover:text-red-700"
                            onClick={() => removeGeographicArea(index)}
                          >
                            Remove
                          </Button>
                        ) : null}
                      </div>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor={`geoRegion-${index}`}>
                            Region <span className="text-muted-foreground font-normal">(optional)</span>
                          </Label>
                          <Input
                            id={`geoRegion-${index}`}
                            value={area.region}
                            onChange={(e) => updateGeographicArea(index, 'region', e.target.value)}
                            placeholder="e.g. Western Maharashtra, North East"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`geoState-${index}`}>State / UT</Label>
                          <Input
                            id={`geoState-${index}`}
                            value={area.state}
                            onChange={(e) => updateGeographicArea(index, 'state', e.target.value)}
                            placeholder="e.g. Maharashtra"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`geoDistrict-${index}`}>
                            District <span className="text-muted-foreground font-normal">(optional)</span>
                          </Label>
                          <Input
                            id={`geoDistrict-${index}`}
                            value={area.district}
                            onChange={(e) => updateGeographicArea(index, 'district', e.target.value)}
                            placeholder="e.g. Pune, Kamrup"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`geoAreaType-${index}`}>
                            Area type <span className="text-muted-foreground font-normal">(optional)</span>
                          </Label>
                          <Select
                            value={area.area_type || 'unset'}
                            onValueChange={(value) =>
                              updateGeographicArea(
                                index,
                                'area_type',
                                value === 'unset' ? '' : value
                              )
                            }
                          >
                            <SelectTrigger id={`geoAreaType-${index}`}>
                              <SelectValue placeholder="Select area type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="unset">Not specified</SelectItem>
                              <SelectItem value="urban">Urban</SelectItem>
                              <SelectItem value="rural">Rural</SelectItem>
                              <SelectItem value="both">Urban & rural</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  ))}

                  <Button type="button" variant="outline" size="sm" onClick={addGeographicArea}>
                    Add another coverage area
                  </Button>
                </div>

                <div className="space-y-3 md:col-span-2">
                  <div>
                    <Label>
                      Execution Capacity <span className="text-muted-foreground font-normal">(optional)</span>
                    </Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Share how much work your NGO can take on. All fields are optional.
                    </p>
                  </div>

                  <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="executionConcurrentProjects">
                          Max concurrent projects <span className="text-muted-foreground font-normal">(optional)</span>
                        </Label>
                        <Input
                          id="executionConcurrentProjects"
                          value={formData.executionCapacity.concurrent_projects}
                          onChange={(e) =>
                            updateExecutionCapacity(
                              'concurrent_projects',
                              e.target.value.replace(/[^\d]/g, '')
                            )
                          }
                          inputMode="numeric"
                          placeholder="e.g. 5"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="executionAnnualBeneficiaries">
                          Annual beneficiaries <span className="text-muted-foreground font-normal">(optional)</span>
                        </Label>
                        <Input
                          id="executionAnnualBeneficiaries"
                          value={formData.executionCapacity.annual_beneficiaries}
                          onChange={(e) =>
                            updateExecutionCapacity(
                              'annual_beneficiaries',
                              e.target.value.replace(/[^\d]/g, '')
                            )
                          }
                          inputMode="numeric"
                          placeholder="e.g. 10000"
                        />
                      </div>

                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="executionDeliveryModel">
                          Delivery model <span className="text-muted-foreground font-normal">(optional)</span>
                        </Label>
                        <Select
                          value={formData.executionCapacity.delivery_model || 'unset'}
                          onValueChange={(value) =>
                            updateExecutionCapacity(
                              'delivery_model',
                              value === 'unset' ? '' : value
                            )
                          }
                        >
                          <SelectTrigger id="executionDeliveryModel">
                            <SelectValue placeholder="Select delivery model" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unset">Not specified</SelectItem>
                            <SelectItem value="direct">Direct delivery</SelectItem>
                            <SelectItem value="partner_led">Partner-led</SelectItem>
                            <SelectItem value="hybrid">Hybrid (direct + partners)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="executionNotes">
                          Additional notes <span className="text-muted-foreground font-normal">(optional)</span>
                        </Label>
                        <Textarea
                          id="executionNotes"
                          value={formData.executionCapacity.notes}
                          onChange={(e) => updateExecutionCapacity('notes', e.target.value)}
                          placeholder="Partner network, reporting cadence, or other capacity details"
                          rows={2}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* NGO headquarters location */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium">NGO Location</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Enter the registered office or primary headquarters of your NGO. We use this city, state, and pincode to match you with nearby CSR campaigns and company recommendations.
                </p>
              </div>

              <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="addressLine">Registered office address</Label>
                  <Textarea
                    id="addressLine"
                    name="addressLine"
                    value={formData.addressLine}
                    onChange={handleChange}
                    placeholder="Building, street, locality"
                    rows={2}
                  />
                  <p className="text-xs text-muted-foreground">
                    Use the address where your NGO is registered or primarily operates from.
                  </p>
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
                      placeholder="e.g. Pune, Guwahati"
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
                    <Label htmlFor="pincode">Pincode / Postal code</Label>
                    <Input
                      id="pincode"
                      name="pincode"
                      value={formData.pincode}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          pincode: normalizePincode(e.target.value, prev.country),
                        }))
                      }
                      inputMode="numeric"
                      placeholder={formData.country === 'India' ? '6-digit pincode' : 'Postal code'}
                      maxLength={formData.country === 'India' ? 6 : 12}
                    />
                    {formErrors.pincode && <p className="text-sm text-red-500">{formErrors.pincode}</p>}
                  </div>
                </div>
              </div>
            </div>
            

            <div className="flex flex-col space-y-4">
              <Button type="submit" className="w-full" disabled={isSubmitting || !otpVerified.email}>
                {isSubmitting ? 'Creating account...' : 'Create NGO Account'}
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