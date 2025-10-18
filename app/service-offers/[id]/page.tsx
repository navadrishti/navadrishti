'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, MapPin, Users, Clock, Target, Calendar, User, Building, MessageSquare, CheckCircle, XCircle, Loader2, DollarSign, AlertTriangle } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/hooks/use-toast'
import { formatPrice } from '@/lib/currency'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'

interface ServiceOffer {
  id: number
  title: string
  description: string
  category: string
  location: string
  price_amount: number
  price_type: 'fixed' | 'negotiable' | 'project_based' | 'hourly'
  price_description: string
  contact_info: string
  ngo_name: string
  ngo_id: number
  status: 'active' | 'paused' | 'completed' | 'cancelled'
  created_at: string
  updated_at: string
}

interface ClientApplication {
  id: number
  client_id: number
  client_type: 'individual' | 'company'
  message: string
  status: 'pending' | 'accepted' | 'rejected' | 'active' | 'completed' | 'cancelled'
  created_at: string
}

export default function ServiceOfferDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user, token } = useAuth()
  const { toast } = useToast()
  
  const [offer, setOffer] = useState<ServiceOffer | null>(null)
  const [userApplication, setUserApplication] = useState<ClientApplication | null>(null)
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [applicationMessage, setApplicationMessage] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [proposedAmount, setProposedAmount] = useState('')

  const offerId = params.id as string
  const isAuthenticated = !!(user && token)

  useEffect(() => {
    if (offerId) {
      fetchOfferDetails()
      if (isAuthenticated && user) {
        checkExistingApplication()
      }
    }
  }, [offerId, isAuthenticated, user])

  const fetchOfferDetails = async () => {
    try {
      const response = await fetch(`/api/service-offers/${offerId}`)
      if (response.ok) {
        const data = await response.json()
        setOffer(data)
      } else {
        toast({
          title: "Error",
          description: "Failed to load service offer details",
          variant: "destructive"
        })
        router.push('/service-offers')
      }
    } catch (error) {
      console.error('Error fetching offer:', error)
      toast({
        title: "Error",
        description: "Failed to load service offer details",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const checkExistingApplication = async () => {
    try {
      const response = await fetch(`/api/service-offers/${offerId}/clients?userId=${user?.id}`)
      if (response.ok) {
        const data = await response.json()
        const existingApplication = data.find((app: ClientApplication) => app.client_id === user?.id)
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
        description: "Please log in to apply for this service offer",
        variant: "destructive"
      })
      router.push('/login')
      return
    }

    if (user.user_type === 'ngo') {
      toast({
        title: "Invalid User Type",
        description: "NGOs cannot apply to service offers",
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
      const response = await fetch(`/api/service-offers/${offerId}/clients`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          client_id: user.id,
          client_type: user.user_type,
          message: applicationMessage,
          start_date: startDate || null,
          end_date: endDate || null,
          proposed_amount: proposedAmount ? parseFloat(proposedAmount) : null
        })
      })

      if (response.ok) {
        const newApplication = await response.json()
        setUserApplication(newApplication)
        setApplicationMessage('')
        setStartDate('')
        setEndDate('')
        setProposedAmount('')
        toast({
          title: "Application Submitted",
          description: "Your application has been submitted successfully",
        })
      } else {
        const error = await response.json()
        const errorMsg = error.error || 'Failed to submit application'
        
        // Handle verification requirement specifically
        if (error.requiresVerification || response.status === 403) {
          const verificationMessage = error.message || 'Please complete account verification before hiring services.'
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

  const getStatusColor = (status: string) => {
    switch (status) {
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

  if (!offer) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <Alert>
            <XCircle className="h-4 w-4" />
            <AlertDescription>
              Service offer not found
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
          <Link href="/service-offers" className="inline-flex items-center text-blue-600 hover:text-blue-800">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Service Offers
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-2xl mb-2">{offer.title}</CardTitle>
                    <CardDescription className="text-base">
                      Offered by <span className="font-semibold">{offer.ngo_name}</span>
                    </CardDescription>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-green-600 flex items-center">
                      <DollarSign className="h-5 w-5" />
                      {formatPrice(offer.price_amount)}
                    </div>
                    <div className="text-sm text-muted-foreground">{offer.price_type} pricing</div>
                    {offer.price_description && (
                      <div className="text-xs text-muted-foreground">{offer.price_description}</div>
                    )}
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-6">
                <div>
                  <h3 className="font-semibold mb-2">Description</h3>
                  <p className="text-muted-foreground leading-relaxed">{offer.description}</p>
                </div>

                <Separator />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{offer.location}</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{offer.category}</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{offer.price_type} pricing</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{offer.status} status</span>
                  </div>
                </div>

                {offer.price_description && (
                  <>
                    <Separator />
                    <div>
                      <h3 className="font-semibold mb-2">Pricing Details</h3>
                      <p className="text-muted-foreground">{offer.price_description}</p>
                    </div>
                  </>
                )}

                {offer.contact_info && (
                  <>
                    <Separator />
                    <div>
                      <h3 className="font-semibold mb-2">Contact Information</h3>
                      <p className="text-muted-foreground">{offer.contact_info}</p>
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
                  Hire This Service
                </CardTitle>
              </CardHeader>
              
              <CardContent>
                {!isAuthenticated ? (
                  <div className="text-center space-y-4">
                    <p className="text-muted-foreground">You need to be logged in to hire this service.</p>
                    <Button asChild className="w-full">
                      <Link href="/login">Log In</Link>
                    </Button>
                  </div>
                ) : user?.user_type === 'ngo' ? (
                  <Alert>
                    <XCircle className="h-4 w-4" />
                    <AlertDescription>
                      NGOs cannot hire services from other NGOs. Only individuals and companies can hire services.
                    </AlertDescription>
                  </Alert>
                ) : user && user.verification_status !== 'verified' ? (
                  <div className="space-y-4">
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        Account verification required to hire services.
                      </AlertDescription>
                    </Alert>
                    
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-md">
                      <div className="flex items-start gap-3">
                        <div className="text-amber-600">⚠️</div>
                        <div>
                          <p className="text-amber-800 font-medium text-sm">Verification Required</p>
                          <p className="text-amber-700 text-sm mt-1">
                            You need to complete {user?.user_type === 'individual' ? 'identity verification (Aadhaar & PAN)' : 'organization verification'} before you can hire services.
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
                        You have already applied to hire this service.
                      </AlertDescription>
                    </Alert>
                    
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Status:</span>
                        <Badge className={getStatusColor(userApplication.status)}>
                          {userApplication.status.charAt(0).toUpperCase() + userApplication.status.slice(1)}
                        </Badge>
                      </div>
                      
                      <div>
                        <span className="text-sm font-medium">Your Message:</span>
                        <p className="text-sm text-muted-foreground mt-1 p-2 bg-muted rounded">
                          {userApplication.message}
                        </p>
                      </div>
                      
                      <p className="text-xs text-muted-foreground">
                        Applied on {new Date(userApplication.created_at).toLocaleDateString()}
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
                        Hiring as {user?.user_type === 'individual' ? 'Individual' : 'Company'}
                      </span>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="message">Application Message *</Label>
                      <Textarea
                        id="message"
                        placeholder="Tell the NGO why you want to hire this service and any specific requirements..."
                        value={applicationMessage}
                        onChange={(e) => setApplicationMessage(e.target.value)}
                        rows={4}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="proposedAmount">Proposed Amount (Optional)</Label>
                      <Input
                        id="proposedAmount"
                        type="number"
                        placeholder={`Default: ${formatPrice(offer.price_amount)}`}
                        value={proposedAmount}
                        onChange={(e) => setProposedAmount(e.target.value)}
                        min="0"
                        step="0.01"
                      />
                      <p className="text-xs text-muted-foreground">
                        Leave empty to use the default price of {formatPrice(offer.price_amount)}
                      </p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-2">
                        <Label htmlFor="startDate">Start Date</Label>
                        <Input
                          id="startDate"
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="endDate">End Date</Label>
                        <Input
                          id="endDate"
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                        />
                      </div>
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