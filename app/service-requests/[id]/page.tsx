'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, MapPin, Users, Clock, Target, Calendar, User, Building, MessageSquare, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/hooks/use-toast'
import { Header } from '@/components/header'
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
        console.log('Service request data:', data); // Debug log
        setRequest(data)
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
        const existingApplication = data.find((app: VolunteerApplication) => app.volunteer_id === user?.id)
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
        toast({
          title: "Application Failed",
          description: error.error || "Failed to submit application",
          variant: "destructive"
        })
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
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin" />
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
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-2xl mb-2">{request.title}</CardTitle>
                    <CardDescription className="text-base">
                      Requested by <span className="font-semibold">{request.ngo_name}</span>
                    </CardDescription>
                  </div>
                  <Badge className={getUrgencyColor(request.urgency_level)}>
                    {request.urgency_level ? 
                      request.urgency_level.charAt(0).toUpperCase() + request.urgency_level.slice(1) : 
                      'Medium'
                    } Priority
                  </Badge>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-6">
                <div>
                  <h3 className="font-semibold mb-2">Description</h3>
                  <p className="text-muted-foreground leading-relaxed">{request.description}</p>
                </div>

                <Separator />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{request.location}</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{request.volunteers_needed} volunteers needed</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{request.category}</span>
                  </div>
                  
                  {request.timeline && (
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{request.timeline}</span>
                    </div>
                  )}
                  
                  {request.deadline && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Deadline: {new Date(request.deadline).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>

                {request.requirements && (
                  <>
                    <Separator />
                    <div>
                      <h3 className="font-semibold mb-2">Requirements</h3>
                      <p className="text-muted-foreground">
                        {typeof request.requirements === 'string' 
                          ? request.requirements 
                          : JSON.stringify(request.requirements, null, 2)
                        }
                      </p>
                    </div>
                  </>
                )}

                {request.contact_info && (
                  <>
                    <Separator />
                    <div>
                      <h3 className="font-semibold mb-2">Contact Information</h3>
                      <p className="text-muted-foreground">{request.contact_info}</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
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
                      disabled={applying || !applicationMessage.trim()}
                      className="w-full"
                    >
                      {applying ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Submitting...
                        </>
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