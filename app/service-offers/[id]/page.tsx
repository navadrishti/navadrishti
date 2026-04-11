'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, MapPin, Users, Clock, Target, Calendar, User, Building, MessageSquare, CheckCircle, XCircle, Loader2, DollarSign, AlertTriangle } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/hooks/use-toast'
import { formatPrice } from '@/lib/utils'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface ServiceOffer {
  id: number
  title: string
  description: string
  category: string
  offer_type?: 'financial' | 'material' | 'service' | 'infrastructure' | string
  location: string
  city?: string
  state_province?: string
  pincode?: string
  amount?: number
  location_scope?: string
  conditions?: string
  item?: string
  quantity?: number
  delivery_scope?: string
  skill?: string
  capacity?: number
  duration?: string
  scope?: string
  images?: string[]
  tags?: string[]
  price_amount: number
  price_type: 'fixed' | 'negotiable' | 'project_based' | 'hourly'
  price_description: string
  contact_info: string
  ngo_name: string
  ngo_id: number
  provider_name?: string
  provider_type?: 'ngo' | 'company' | 'individual' | string
  provider_profile_image?: string | null
  status: 'active' | 'paused' | 'completed' | 'cancelled'
  created_at: string
  updated_at: string
}

interface ClientApplication {
  id: number
  client_id: number
  client_type: 'individual' | 'company' | 'ngo'
  message: string
  status: 'pending' | 'accepted' | 'rejected' | 'active' | 'completed' | 'cancelled'
  created_at: string
}

const formatDate = (value?: string | null) => {
  if (!value) return 'N/A'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'N/A'
  return date.toLocaleDateString('en-IN', { timeZone: 'UTC' })
}

export default function ServiceOfferDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user, token } = useAuth()
  const { toast } = useToast()
  const [isHydrated, setIsHydrated] = useState(false)
  
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
  const effectiveUserType = isHydrated ? user?.user_type : undefined
  const canApplyToOffer = !!user && user.id !== offer?.ngo_id
  const canShowRespondTab = !isAuthenticated || canApplyToOffer
  const offerVisibleTabCount = canShowRespondTab ? 2 : 1
  const showOfferTabList = offerVisibleTabCount > 1

  useEffect(() => {
    setIsHydrated(true)
  }, [])

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
      const response = await fetch(`/api/service-offers/${offerId}`, { cache: 'no-store' })
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
        setUserApplication(data || null)
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

    if (offer && user.id === offer.ngo_id) {
      toast({
        title: "Not Allowed",
        description: "You cannot respond to your own capability offer",
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
        <div className="mx-auto max-w-7xl px-4 py-8">
          <div className="mb-6">
            <div className="h-5 w-44 rounded bg-gray-200 animate-pulse"></div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-4">
              <Card className="lg:sticky lg:top-20">
                <CardHeader>
                  <div className="h-6 w-40 rounded bg-gray-200 animate-pulse" />
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="h-28 w-28 md:h-32 md:w-32 rounded-lg bg-gray-200 animate-pulse mx-auto" />
                  <div className="space-y-2">
                    <div className="h-6 w-3/4 rounded bg-gray-200 animate-pulse" />
                    <div className="h-4 w-1/2 rounded bg-gray-200 animate-pulse" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-4 w-full rounded bg-gray-200 animate-pulse" />
                    <div className="h-4 w-10/12 rounded bg-gray-200 animate-pulse" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-8">
              <Card>
                <CardHeader>
                  <div className="h-6 w-64 rounded bg-gray-200 animate-pulse" />
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid w-full grid-cols-2 gap-2">
                    <div className="h-10 rounded bg-gray-200 animate-pulse" />
                    <div className="h-10 rounded bg-gray-200 animate-pulse" />
                  </div>
                  <SkeletonBigBox />
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!offer) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <Header />
        <div className="mx-auto max-w-7xl px-4 py-8">
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
      
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => router.back()} className="w-full justify-start px-0 text-blue-600 hover:text-blue-800 hover:bg-transparent active:bg-transparent focus-visible:bg-transparent focus-visible:ring-0 sm:w-auto">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-4">
            <Card className="lg:sticky lg:top-20">
              <CardHeader>
                <CardTitle>Service Provider</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="h-28 w-28 md:h-32 md:w-32 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden mx-auto">
                  {offer.provider_profile_image ? (
                    <img
                      src={offer.provider_profile_image}
                      alt={offer.provider_name || offer.ngo_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Building className="h-12 w-12 text-gray-400" />
                  )}
                </div>

                <div>
                  <h3 className="text-lg font-semibold">{offer.provider_name || offer.ngo_name}</h3>
                  <p className="text-sm text-gray-500 capitalize">{offer.provider_type || 'ngo'}</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Coverage</p>
                    <p>{offer.location_scope || offer.location || 'Not specified'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Contact</p>
                    <p className="break-words">{offer.contact_info || 'Not specified'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-8">
            <Card>
              <CardContent className="pt-6">
                <Tabs defaultValue="details" className="w-full">
                  {showOfferTabList ? (
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="details">Capability Details</TabsTrigger>
                      <TabsTrigger value="respond">Respond</TabsTrigger>
                    </TabsList>
                  ) : null}

                  <TabsContent value="details" className={`${showOfferTabList ? 'mt-4' : ''}`}>
                    <ServiceDetails
                      id={offer.id}
                      title={offer.title}
                      description={offer.description}
                      category={offer.category}
                      location={offer.location}
                      images={offer.images}
                      ngo_name={offer.provider_name || offer.ngo_name}
                      ngo_id={offer.ngo_id}
                      provider={offer.provider_name || offer.ngo_name}
                      providerType={offer.provider_type || 'ngo'}
                      provider_profile_image={offer.provider_profile_image}
                      verified={true}
                      tags={offer.tags}
                      created_at={offer.created_at}
                      price_amount={offer.price_amount}
                      price_type={offer.price_type}
                      price_description={offer.price_description}
                      transaction_type={offer.transaction_type}
                      status={offer.status}
                      contact_info={offer.contact_info}
                      offer_type={offer.offer_type}
                      amount={offer.amount}
                      location_scope={offer.location_scope}
                      conditions={offer.conditions}
                      item={offer.item}
                      quantity={offer.quantity}
                      delivery_scope={offer.delivery_scope}
                      skill={offer.skill}
                      capacity={offer.capacity}
                      duration={offer.duration}
                      scope={offer.scope}
                      type="offer"
                      hideSidebar
                    />
                  </TabsContent>

                  {canShowRespondTab ? (
                  <TabsContent value="respond" className={`${showOfferTabList ? 'mt-4' : ''}`}>
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <MessageSquare className="h-5 w-5" />
                          Respond to This Capability
                        </CardTitle>
                      </CardHeader>

                      <CardContent>
                {!isAuthenticated ? (
                  <div className="text-center space-y-4">
                    <p className="text-muted-foreground">You need to be logged in to respond to this capability offer.</p>
                    <Button asChild className="w-full">
                      <Link href="/login">Log In</Link>
                    </Button>
                  </div>
                ) : !canApplyToOffer ? (
                  <Alert>
                    <XCircle className="h-4 w-4" />
                    <AlertDescription>
                      Offer owners cannot respond to their own capability listing.
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
                        <div className="text-amber-600"></div>
                        <div>
                          <p className="text-amber-800 font-medium text-sm">Verification Required</p>
                          <p className="text-amber-700 text-sm mt-1">
                            You need to complete identity verification (Aadhaar & PAN) before you can apply to service offers.
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
                        Applied on {formatDate(userApplication.created_at)}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 p-2 bg-muted rounded">
                      <User className="h-4 w-4" />
                      <span className="text-sm">Responding as {effectiveUserType || 'user'}</span>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="message">Application Message *</Label>
                      <Textarea
                        id="message"
                        placeholder="Tell the provider why you are a good fit for this service opportunity..."
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
                        Leave empty to use the listed price of {formatPrice(offer.price_amount)}
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
                  </TabsContent>
                  ) : null}
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}