'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, MapPin, Users, Clock, Target, Calendar, User, Building, MessageSquare, CheckCircle, XCircle, Loader2, AlertTriangle } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/hooks/use-toast'
import { Header } from '@/components/header'
import { ServiceDetails } from '@/components/service-details'
import { SkeletonHeader, SkeletonAvatarText, SkeletonTextLines, SkeletonBigBox } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'

interface ServiceRequest {
  id: number
  title: string
  description: string
  urgency_level: 'low' | 'medium' | 'high' | 'critical'
  category: string
  location: string
  images?: string[]
  tags?: string[]
  requirements: string | object
  volunteers_needed: number
  timeline: string
  contact_info: string
  deadline: string
  ngo_name: string
  ngo_id: number
  status: 'active' | 'in_progress' | 'completed' | 'cancelled'
  created_at: string
  updated_at: string
}

interface VolunteerApplication {
  id: number
  volunteer_id: number
  volunteer_type: 'individual' | 'company'
  application_message: string
  status: 'pending' | 'accepted' | 'rejected' | 'active' | 'completed' | 'cancelled'
  applied_at: string
}

export default function ServiceRequestDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user, token } = useAuth()
  const { toast } = useToast()
  
  const [request, setRequest] = useState<ServiceRequest | null>(null)
  const [userApplication, setUserApplication] = useState<VolunteerApplication | null>(null)
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [applicationMessage, setApplicationMessage] = useState('')

  const requestId = params.id as string
  const isAuthenticated = !!(user && token)

  useEffect(() => {
    if (requestId) {
      fetchRequestDetails()
      if (isAuthenticated && user) {
        checkExistingApplication()
      }
    }
  }, [requestId, isAuthenticated, user])

  const fetchRequestDetails = async () => {
    try {
      const response = await fetch(`/api/service-requests/${requestId}`)
      if (response.ok) {
        const data = await response.json()
        
        // Handle the new API response format
        if (data.success) {
          setRequest(data.data)
        } else {
          setRequest(data) // Fallback for old format
        }
      } else {
        toast({
          title: "Error",
          description: "Failed to load service request details",
          variant: "destructive"
        })
        router.push('/service-requests')
      }
    } catch (error) {
      console.error('Error fetching request:', error)
      toast({
        title: "Error",
        description: "Failed to load service request details",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const checkExistingApplication = async () => {
    try {
      const response = await fetch(`/api/service-requests/${requestId}/volunteers?userId=${user?.id}`)
      if (response.ok) {
        const data = await response.json()
        // Handle both old and new API response formats
        const applications = data.success ? data.data : data
        const existingApplication = applications.find((app: VolunteerApplication) => app.volunteer_id === user?.id)
        setUserApplication(existingApplication || null)
      }
    } catch (error) {
      console.error('Error checking application:', error)
    }
  }

  const handleApply = async () => {
    if (!isAuthenticated || !user) {
      toast({
        title: "Authentication Required",
        description: "Please log in to apply for this service request",
        variant: "destructive"
      })
      router.push('/login')
      return
    }

    if (user.user_type === 'ngo') {
      toast({
        title: "Invalid User Type",
        description: "NGOs cannot apply to service requests",
        variant: "destructive"
      })
      return
    }

    if (!applicationMessage.trim()) {
      toast({
        title: "Message Required",
        description: "Please provide a message with your application",
        variant: "destructive"
      })
      return
    }

    setApplying(true)
    
    try {
      const response = await fetch(`/api/service-requests/${requestId}/volunteers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          volunteer_id: user.id,
          message: applicationMessage
        })
      })

      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setUserApplication(result.data)
          setApplicationMessage('')
          toast({
            title: "Application Submitted",
            description: "Your application has been submitted successfully. You can view your applications in the 'My Volunteering' tab.",
          })
          
          // Redirect to service requests page with volunteering tab after a short delay
          setTimeout(() => {
            router.push('/service-requests?tab=volunteering')
          }, 2000)
        } else {
          toast({
            title: "Application Failed",
            description: result.error || "Failed to submit application",
            variant: "destructive"
          })
        }
      } else {
        const error = await response.json()
        const errorMsg = error.error || 'Failed to submit application'
        
        // Handle verification requirement specifically
        if (error.requiresVerification || response.status === 403) {
          const verificationMessage = error.message || 'Please complete account verification before applying for volunteer opportunities.'
          toast({
            title: "Verification Required",
            description: verificationMessage,
            variant: "destructive"
          })
          // Optionally redirect to verification page after a delay
          setTimeout(() => {
            router.push('/verification')
          }, 3000)
        } else {
          toast({
            title: "Application Failed",
            description: errorMsg,
            variant: "destructive"
          })
        }
      }
    } catch (error) {
      console.error('Error applying:', error)
      toast({
        title: "Error",
        description: "Failed to submit application",
        variant: "destructive"
      })
    } finally {
      setApplying(false)
    }
  }

  const getUrgencyColor = (urgency: string) => {
    if (!urgency) return 'bg-gray-100 text-gray-800 border-gray-200';
    switch (urgency.toLowerCase()) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200'
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'low': return 'bg-green-100 text-green-800 border-green-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getStatusColor = (status: string) => {
    if (!status) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    switch (status.toLowerCase()) {
      case 'accepted': return 'bg-green-100 text-green-800 border-green-200'
      case 'rejected': return 'bg-red-100 text-red-800 border-red-200'
      case 'active': return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'completed': return 'bg-purple-100 text-purple-800 border-purple-200'
      case 'cancelled': return 'bg-gray-100 text-gray-800 border-gray-200'
      default: return 'bg-yellow-100 text-yellow-800 border-yellow-200'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <Header />
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          {/* Back button skeleton */}
          <div className="mb-8">
            <div className="h-10 bg-gray-200 rounded-md w-32 animate-pulse"></div>
          </div>

          {/* Main content skeleton */}
          <div className="grid gap-8 md:grid-cols-3">
            {/* Main content */}
            <div className="md:col-span-2 space-y-6">
              <SkeletonBigBox />
              
              {/* Details section */}
              <div className="rounded-lg border bg-white p-6 space-y-4">
                <SkeletonHeader />
                <SkeletonTextLines lines={4} />
                
                {/* Info items */}
                <div className="grid gap-4 md:grid-cols-2 mt-6">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <SkeletonAvatarText key={i} />
                  ))}
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              <div className="rounded-lg border bg-white p-6">
                <SkeletonAvatarText />
                <div className="mt-4 space-y-3">
                  <SkeletonTextLines lines={2} />
                  <div className="h-10 bg-blue-200 rounded-md w-full animate-pulse"></div>
                </div>
              </div>
              
              <div className="rounded-lg border bg-white p-6">
                <div className="h-6 bg-gray-200 rounded w-24 animate-pulse mb-4"></div>
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <SkeletonAvatarText key={i} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!request) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <Alert>
            <XCircle className="h-4 w-4" />
            <AlertDescription>
              Service request not found
            </AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Link href="/service-requests" className="inline-flex items-center text-blue-600 hover:text-blue-800">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Service Requests
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2">
            <ServiceDetails
              id={request.id}
              title={request.title}
              description={request.description}
              category={request.category}
              location={request.location}
              images={request.images}
              ngo_name={request.ngo_name}
              ngo_id={request.ngo_id}
              provider={request.ngo_name}
              providerType="ngo"
              verified={true}
              tags={request.tags}
              created_at={request.created_at}
              urgency_level={request.urgency_level}
              volunteers_needed={request.volunteers_needed}
              timeline={request.timeline}
              deadline={request.deadline}
              requirements={request.requirements}
              type="request"
            />
          </div>

          {/* Application Sidebar */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Apply for This Request
                </CardTitle>
              </CardHeader>
              
              <CardContent>
                {!isAuthenticated ? (
                  <div className="text-center space-y-4">
                    <p className="text-muted-foreground">You need to be logged in to apply for this service request.</p>
                    <Button asChild className="w-full">
                      <Link href="/login">Log In</Link>
                    </Button>
                  </div>
                ) : user?.user_type === 'ngo' ? (
                  <Alert>
                    <XCircle className="h-4 w-4" />
                    <AlertDescription>
                      NGOs cannot apply to service requests. Only individuals and companies can volunteer.
                    </AlertDescription>
                  </Alert>
                ) : user && user.verification_status !== 'verified' ? (
                  <div className="space-y-4">
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        Account verification required to apply for volunteer opportunities.
                      </AlertDescription>
                    </Alert>
                    
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-md">
                      <div className="flex items-start gap-3">
                        <div className="text-amber-600"></div>
                        <div>
                          <p className="text-amber-800 font-medium text-sm">Verification Required</p>
                          <p className="text-amber-700 text-sm mt-1">
                            You need to complete {user?.user_type === 'individual' ? 'identity verification (Aadhaar & PAN)' : 'organization verification'} before you can apply for volunteer opportunities.
                            <Link href="/verification" className="underline font-medium ml-1 hover:text-amber-900">
                              Complete verification now
                            </Link>
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : userApplication ? (
                  <div className="space-y-4">
                    <Alert>
                      <CheckCircle className="h-4 w-4" />
                      <AlertDescription>
                        You have already applied for this service request.
                      </AlertDescription>
                    </Alert>
                    
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Status:</span>
                        <Badge className={getStatusColor(userApplication.status)}>
                          {userApplication.status ? 
                            userApplication.status.charAt(0).toUpperCase() + userApplication.status.slice(1) :
                            'Pending'
                          }
                        </Badge>
                      </div>
                      
                      <div>
                        <span className="text-sm font-medium">Your Message:</span>
                        <p className="text-sm text-muted-foreground mt-1 p-2 bg-muted rounded">
                          {userApplication.application_message}
                        </p>
                      </div>
                      
                      <p className="text-xs text-muted-foreground">
                        Applied on {new Date(userApplication.applied_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 p-2 bg-muted rounded">
                      {user?.user_type === 'individual' ? (
                        <User className="h-4 w-4" />
                      ) : (
                        <Building className="h-4 w-4" />
                      )}
                      <span className="text-sm">
                        Applying as {user?.user_type === 'individual' ? 'Individual' : 'Company'}
                      </span>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="message">Application Message *</Label>
                      <Textarea
                        id="message"
                        placeholder="Tell the NGO why you want to volunteer for this request and how you can help..."
                        value={applicationMessage}
                        onChange={(e) => setApplicationMessage(e.target.value)}
                        rows={4}
                      />
                    </div>
                    
                    <Button 
                      onClick={handleApply} 
                      disabled={applying || !applicationMessage.trim() || (user && user.verification_status !== 'verified')}
                      className="w-full"
                    >
                      {applying ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Submitting...
                        </>
                      ) : user && user.verification_status !== 'verified' ? (
                        'Verification Required'
                      ) : (
                        'Submit Application'
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}