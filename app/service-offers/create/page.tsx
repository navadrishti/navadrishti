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
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Loader2, Plus, X, Users, MapPin, DollarSign, Clock, Briefcase } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/hooks/use-toast'
import Link from 'next/link'

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
]

const employmentTypes = [
  { value: 'full_time', label: 'Full Time' },
  { value: 'part_time', label: 'Part Time' },
  { value: 'contract', label: 'Contract/Freelance' },
  { value: 'internship', label: 'Internship' },
  { value: 'volunteer', label: 'Volunteer' }
]

const experienceLevels = [
  { value: 'entry', label: 'Entry Level (0-1 years)' },
  { value: 'junior', label: 'Junior (1-3 years)' },
  { value: 'mid', label: 'Mid Level (3-5 years)' },
  { value: 'senior', label: 'Senior (5+ years)' },
  { value: 'any', label: 'Any Experience Level' }
]

const paymentFrequencies = [
  { value: 'hourly', label: 'Per Hour' },
  { value: 'daily', label: 'Per Day' },
  { value: 'weekly', label: 'Per Week' },
  { value: 'monthly', label: 'Per Month' },
  { value: 'project', label: 'Per Project' }
]

const commonBenefits = [
  'Health Insurance',
  'Accommodation Provided',
  'Meals Provided',
  'Transportation Allowance',
  'Training & Development',
  'Certification Provided',
  'Flexible Working Hours',
  'Work from Home Option',
  'Performance Bonus',
  'Annual Leave',
  'Professional Growth Opportunities'
]

const commonSkills = [
  'Communication',
  'Teaching',
  'Computer Skills',
  'First Aid',
  'Driving',
  'Counseling',
  'Data Entry',
  'Customer Service',
  'Project Management',
  'Social Media',
  'Languages',
  'Medical Knowledge'
]

export default function CreateServiceOfferPage() {
  const router = useRouter()
  const { user, token } = useAuth()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [individuals, setIndividuals] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  
  const [formData, setFormData] = useState({
    // Basic Information
    title: '',
    description: '',
    category: '',
    employment_type: '',
    
    // Location
    location: '',
    city: '',
    state_province: '',
    pincode: '',
    
    // Wages & Compensation
    wage_info: {
      min_amount: '',
      max_amount: '',
      currency: 'INR',
      payment_frequency: 'monthly',
      negotiable: false
    },
    
    // Experience & Skills
    experience_requirements: {
      level: 'any',
      years_required: 0,
      specific_skills: [] as string[],
      certifications: [] as string[]
    },
    skills_required: [] as string[],
    
    // Duration & Schedule
    duration: {
      type: 'ongoing', // 'fixed' or 'ongoing'
      duration_months: ''
    },
    working_hours: {
      hours_per_week: '',
      flexible: false,
      schedule_details: ''
    },
    
    // Benefits & Application
    benefits: [] as string[],
    application_deadline: '',
    start_date: '',
    
    // Contact & Invitations
    contact_preferences: {
      email: true,
      phone: false,
      whatsapp: false
    },
    invited_individuals: [] as number[],
    
    // Media & Tags
    images: [] as string[],
    tags: [] as string[]
  })

  // Check authentication and user type
  useEffect(() => {
    if (!user) {
      router.push('/login')
      return
    }
    if (user.user_type !== 'ngo') {
      toast({
        title: "Access Denied",
        description: "Only NGOs can create service offers",
        variant: "destructive",
      })
      router.push('/service-offers')
      return
    }
  }, [user, router, toast])

  // Fetch individuals for invitations
  useEffect(() => {
    const fetchIndividuals = async () => {
      if (!token) return
      
      try {
        const response = await fetch('/api/users?type=individual', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
        
        if (response.ok) {
          const data = await response.json()
          setIndividuals(data.users || [])
        }
      } catch (error) {
        console.warn('Failed to fetch individuals:', error)
      }
    }
    
    fetchIndividuals()
  }, [token])

  const handleSkillAdd = (skill: string, type: 'required' | 'experience') => {
    if (!skill.trim()) return
    
    if (type === 'required') {
      if (!formData.skills_required.includes(skill)) {
        setFormData(prev => ({
          ...prev,
          skills_required: [...prev.skills_required, skill]
        }))
      }
    } else {
      if (!formData.experience_requirements.specific_skills.includes(skill)) {
        setFormData(prev => ({
          ...prev,
          experience_requirements: {
            ...prev.experience_requirements,
            specific_skills: [...prev.experience_requirements.specific_skills, skill]
          }
        }))
      }
    }
  }

  const handleSkillRemove = (skill: string, type: 'required' | 'experience') => {
    if (type === 'required') {
      setFormData(prev => ({
        ...prev,
        skills_required: prev.skills_required.filter(s => s !== skill)
      }))
    } else {
      setFormData(prev => ({
        ...prev,
        experience_requirements: {
          ...prev.experience_requirements,
          specific_skills: prev.experience_requirements.specific_skills.filter(s => s !== skill)
        }
      }))
    }
  }

  const handleBenefitToggle = (benefit: string) => {
    setFormData(prev => ({
      ...prev,
      benefits: prev.benefits.includes(benefit)
        ? prev.benefits.filter(b => b !== benefit)
        : [...prev.benefits, benefit]
    }))
  }

  const handleIndividualInvite = (individualId: number) => {
    setFormData(prev => ({
      ...prev,
      invited_individuals: prev.invited_individuals.includes(individualId)
        ? prev.invited_individuals.filter(id => id !== individualId)
        : [...prev.invited_individuals, individualId]
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!token) {
      toast({
        title: "Authentication Error",
        description: "Please log in to create a service offer",
        variant: "destructive",
      })
      return
    }

    // Validate required fields
    if (!formData.title || !formData.description || !formData.category) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      })
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/service-offers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      })

      const data = await response.json()

      if (response.ok) {
        toast({
          title: "Service Offer Created!",
          description: data.data.message,
          variant: "default",
        })
        router.push('/service-offers?view=my-offers')
      } else {
        toast({
          title: "Error",
          description: data.error || 'Failed to create service offer',
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error('Error creating service offer:', error)
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const filteredIndividuals = individuals.filter(individual =>
    individual.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    individual.email?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (!user || user.user_type !== 'ngo') {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <Link href="/service-offers" className="inline-flex items-center text-blue-600 hover:text-blue-700 mb-4">
            <ArrowLeft size={20} className="mr-2" />
            Back to Service Offers
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Create Service Offer</h1>
          <p className="text-gray-600 mt-2">Create a comprehensive job opportunity for individuals and companies</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Briefcase className="mr-2" size={20} />
                Basic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="title">Job Title *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g., Community Health Worker, Education Coordinator"
                  required
                />
              </div>

              <div>
                <Label htmlFor="description">Job Description *</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe the role, responsibilities, and what you're looking for..."
                  rows={4}
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="category">Category *</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
                  >
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
                  <Label htmlFor="employment_type">Employment Type *</Label>
                  <Select
                    value={formData.employment_type}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, employment_type: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {employmentTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Location */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <MapPin className="mr-2" size={20} />
                Location Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="location">Work Location</Label>
                <Input
                  id="location"
                  value={formData.location}
                  onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                  placeholder="e.g., Our main office, Remote, Field work in rural areas"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={formData.city}
                    onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                    placeholder="e.g., Mumbai"
                  />
                </div>
                <div>
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    value={formData.state_province}
                    onChange={(e) => setFormData(prev => ({ ...prev, state_province: e.target.value }))}
                    placeholder="e.g., Maharashtra"
                  />
                </div>
                <div>
                  <Label htmlFor="pincode">Pincode</Label>
                  <Input
                    id="pincode"
                    value={formData.pincode}
                    onChange={(e) => setFormData(prev => ({ ...prev, pincode: e.target.value }))}
                    placeholder="e.g., 400001"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Wages & Compensation */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <DollarSign className="mr-2" size={20} />
                Wages & Compensation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="min_wage">Minimum Amount (₹)</Label>
                  <Input
                    id="min_wage"
                    type="number"
                    value={formData.wage_info.min_amount}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      wage_info: { ...prev.wage_info, min_amount: e.target.value }
                    }))}
                    placeholder="e.g., 15000"
                  />
                </div>
                <div>
                  <Label htmlFor="max_wage">Maximum Amount (₹)</Label>
                  <Input
                    id="max_wage"
                    type="number"
                    value={formData.wage_info.max_amount}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      wage_info: { ...prev.wage_info, max_amount: e.target.value }
                    }))}
                    placeholder="e.g., 25000"
                  />
                </div>
                <div>
                  <Label htmlFor="payment_frequency">Payment Frequency</Label>
                  <Select
                    value={formData.wage_info.payment_frequency}
                    onValueChange={(value) => setFormData(prev => ({
                      ...prev,
                      wage_info: { ...prev.wage_info, payment_frequency: value }
                    }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentFrequencies.map((freq) => (
                        <SelectItem key={freq.value} value={freq.value}>
                          {freq.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="negotiable"
                  checked={formData.wage_info.negotiable}
                  onCheckedChange={(checked) => setFormData(prev => ({
                    ...prev,
                    wage_info: { ...prev.wage_info, negotiable: checked as boolean }
                  }))}
                />
                <Label htmlFor="negotiable">Salary is negotiable</Label>
              </div>
            </CardContent>
          </Card>

          {/* Benefits */}
          <Card>
            <CardHeader>
              <CardTitle>Benefits & Perks</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {commonBenefits.map((benefit) => (
                  <div key={benefit} className="flex items-center space-x-2">
                    <Checkbox
                      id={benefit}
                      checked={formData.benefits.includes(benefit)}
                      onCheckedChange={() => handleBenefitToggle(benefit)}
                    />
                    <Label htmlFor={benefit} className="text-sm">{benefit}</Label>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Experience Requirements */}
          <Card>
            <CardHeader>
              <CardTitle>Experience & Skills Required</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="experience_level">Experience Level</Label>
                <Select
                  value={formData.experience_requirements.level}
                  onValueChange={(value) => setFormData(prev => ({
                    ...prev,
                    experience_requirements: { ...prev.experience_requirements, level: value }
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {experienceLevels.map((level) => (
                      <SelectItem key={level.value} value={level.value}>
                        {level.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Required Skills</Label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {formData.skills_required.map((skill) => (
                    <Badge key={skill} variant="secondary" className="pr-1">
                      {skill}
                      <button
                        type="button"
                        onClick={() => handleSkillRemove(skill, 'required')}
                        className="ml-1 hover:bg-gray-200 rounded"
                      >
                        <X size={14} />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {commonSkills.map((skill) => (
                    <Button
                      key={skill}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleSkillAdd(skill, 'required')}
                      className="h-8"
                      disabled={formData.skills_required.includes(skill)}
                    >
                      <Plus size={14} className="mr-1" />
                      {skill}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Working Hours & Duration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Clock className="mr-2" size={20} />
                Schedule & Duration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="hours_per_week">Hours per Week</Label>
                  <Input
                    id="hours_per_week"
                    type="number"
                    value={formData.working_hours.hours_per_week}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      working_hours: { ...prev.working_hours, hours_per_week: e.target.value }
                    }))}
                    placeholder="e.g., 40"
                  />
                </div>
                <div>
                  <Label htmlFor="duration_type">Duration</Label>
                  <Select
                    value={formData.duration.type}
                    onValueChange={(value) => setFormData(prev => ({
                      ...prev,
                      duration: { ...prev.duration, type: value }
                    }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ongoing">Ongoing</SelectItem>
                      <SelectItem value="fixed">Fixed Duration</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {formData.duration.type === 'fixed' && (
                <div>
                  <Label htmlFor="duration_months">Duration (Months)</Label>
                  <Input
                    id="duration_months"
                    type="number"
                    value={formData.duration.duration_months}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      duration: { ...prev.duration, duration_months: e.target.value }
                    }))}
                    placeholder="e.g., 6"
                  />
                </div>
              )}

              <div>
                <Label htmlFor="schedule_details">Schedule Details</Label>
                <Textarea
                  id="schedule_details"
                  value={formData.working_hours.schedule_details}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    working_hours: { ...prev.working_hours, schedule_details: e.target.value }
                  }))}
                  placeholder="e.g., Monday to Friday, 9 AM to 5 PM"
                  rows={2}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="flexible"
                  checked={formData.working_hours.flexible}
                  onCheckedChange={(checked) => setFormData(prev => ({
                    ...prev,
                    working_hours: { ...prev.working_hours, flexible: checked as boolean }
                  }))}
                />
                <Label htmlFor="flexible">Flexible working hours</Label>
              </div>
            </CardContent>
          </Card>

          {/* Invite Individuals */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Users className="mr-2" size={20} />
                Invite Specific Individuals (Optional)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="search_individuals">Search Individuals</Label>
                <Input
                  id="search_individuals"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by name or email..."
                />
              </div>

              <div className="max-h-60 overflow-y-auto space-y-2">
                {filteredIndividuals.map((individual) => (
                  <div key={individual.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">{individual.name}</p>
                      <p className="text-sm text-gray-600">{individual.email}</p>
                      {individual.location && (
                        <p className="text-sm text-gray-500">{individual.location}</p>
                      )}
                    </div>
                    <Checkbox
                      checked={formData.invited_individuals.includes(individual.id)}
                      onCheckedChange={() => handleIndividualInvite(individual.id)}
                    />
                  </div>
                ))}
              </div>

              {formData.invited_individuals.length > 0 && (
                <div>
                  <p className="text-sm text-gray-600">
                    {formData.invited_individuals.length} individual(s) will be invited to apply
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Application Details */}
          <Card>
            <CardHeader>
              <CardTitle>Application Timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="application_deadline">Application Deadline</Label>
                  <Input
                    id="application_deadline"
                    type="date"
                    value={formData.application_deadline}
                    onChange={(e) => setFormData(prev => ({ ...prev, application_deadline: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="start_date">Expected Start Date</Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Submit Button */}
          <div className="flex justify-end space-x-4">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Service Offer'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}