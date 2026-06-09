'use client'

import { useState, useEffect, useMemo } from 'react'
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
import { Checkbox } from '@/components/ui/checkbox'

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
  transaction_type?: 'sell' | 'rent' | 'volunteer' | string
  contact_info: string
  ngo_name: string
  creator_id: number
  provider_name?: string
  provider_type?: 'ngo' | 'company' | 'individual' | string
  provider_profile_image?: string | null
  status: 'active' | 'paused' | 'completed' | 'cancelled'
  valid_until?: string | null
  created_at: string
  updated_at: string
}

interface ClientApplication {
  id: number
  client_id: number
  service_request_id?: number | null
  client_type: 'individual' | 'company' | 'ngo'
  message: string
  status: 'pending' | 'accepted' | 'rejected' | 'active' | 'completed' | 'cancelled'
  response_meta?: Record<string, any> | null
  created_at: string
}

interface NgoNeedOption {
  id: number
  title: string
  status: string
  request_type?: string | null
  estimated_budget?: string | number | null
  target_amount?: string | number | null
  target_quantity?: string | number | null
  beneficiary_count?: string | number | null
  project_id?: string | null
}

const formatDate = (value?: string | null) => {
  if (!value) return 'N/A'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'N/A'
  return date.toLocaleDateString('en-IN', { timeZone: 'UTC' })
}

const getInitials = (name?: string) => {
  if (!name) return 'SP'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'SP'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
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
  const [paying, setPaying] = useState(false)
  const [selectedNeedIds, setSelectedNeedIds] = useState<number[]>([])
  const [ngoNeeds, setNgoNeeds] = useState<NgoNeedOption[]>([])
  const [loadingNgoNeeds, setLoadingNgoNeeds] = useState(false)

  const offerId = params.id as string
  const isAuthenticated = !!(user && token)
  const effectiveUserType = isHydrated ? user?.user_type : undefined
  const canApplyToOffer = !!user && user.id !== offer?.creator_id && user.user_type === 'ngo'
  const canShowRespondTab = !isAuthenticated || canApplyToOffer
  const selectedNeedSummaries = useMemo(
    () => ngoNeeds.filter((need) => selectedNeedIds.includes(need.id)),
    [ngoNeeds, selectedNeedIds]
  )
  const selectedNeedTotal = useMemo(() => {
    return selectedNeedSummaries.reduce((sum, need) => {
      const amount = Number(need.estimated_budget ?? need.target_amount ?? 0)
      return sum + (Number.isFinite(amount) ? amount : 0)
    }, 0)
  }, [selectedNeedSummaries])
  const isOfferExpired = !!offer?.valid_until && new Date(String(offer.valid_until)).getTime() < Date.now()

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if ((window as any).Razorpay) return

    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    document.body.appendChild(script)

    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script)
      }
    }
  }, [])

  useEffect(() => {
    if (offerId) {
      fetchOfferDetails()
      if (isAuthenticated && user) {
        checkExistingApplication()
        fetchNgoNeeds()
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

  const fetchNgoNeeds = async () => {
    if (!user || user.user_type !== 'ngo') {
      setNgoNeeds([])
      return
    }

    try {
      setLoadingNgoNeeds(true)
      const response = await fetch('/api/service-requests?view=my-requests&limit=100', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (!response.ok) {
        setNgoNeeds([])
        return
      }

      const data = await response.json()
      const requests = Array.isArray(data?.data) ? data.data : []
      setNgoNeeds(
        requests
          .filter((request: any) => !['completed', 'cancelled'].includes(String(request.status || '').toLowerCase()))
          .map((request: any) => ({
            id: Number(request.id),
            title: String(request.title || 'Need'),
            status: String(request.status || '').toLowerCase(),
            request_type: request.request_type || null,
            estimated_budget: request.estimated_budget ?? null,
            target_amount: request.target_amount ?? null,
            target_quantity: request.target_quantity ?? null,
            beneficiary_count: request.beneficiary_count ?? null,
            project_id: request.project_id ? String(request.project_id) : null
          }))
      )
    } catch (error) {
      console.error('Error fetching NGO needs:', error)
      setNgoNeeds([])
    } finally {
      setLoadingNgoNeeds(false)
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

    if (offer && user.id === offer.creator_id) {
      toast({
        title: "Not Allowed",
        description: "You cannot apply to your own capability offer",
        variant: "destructive"
      })
      return
    }

    if (user.user_type !== 'ngo') {
      toast({
        title: 'NGO only',
        description: 'Only NGOs can apply from this offer details page.',
        variant: 'destructive'
      })
      return
    }

    if (isOfferExpired) {
      toast({
        title: 'Offer expired',
        description: 'This capability offer has already expired.',
        variant: 'destructive'
      })
      return
    }

    if (selectedNeedIds.length === 0) {
      toast({
        title: 'Select a need',
        description: 'Please select one or more active needs before submitting.',
        variant: "destructive"
      })
      return
    }

    const selectedNeedTotalAmount = selectedNeedSummaries.reduce((sum, need) => {
      const amount = Number(need.estimated_budget ?? need.target_amount ?? 0)
      return sum + (Number.isFinite(amount) ? amount : 0)
    }, 0)

    if (Number.isFinite(Number(offer?.price_amount || 0)) && selectedNeedTotalAmount > Number(offer?.price_amount || 0)) {
      toast({
        title: 'Selection exceeds offer value',
        description: 'Please choose needs whose total value fits within the offer amount.',
        variant: 'destructive'
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
          selected_need_ids: selectedNeedIds,
          message: `Applying for: ${selectedNeedSummaries.map((need) => need.title).join(', ')}`
        })
      })

      if (response.ok) {
        const newApplication = await response.json()
        setUserApplication(newApplication)
        setSelectedNeedIds([])
        toast({
          title: "Application Submitted",
          description: "Your request has been submitted for the selected needs.",
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

  const handlePayForApplication = async () => {
    if (!offer || !user || !token || !userApplication) return

    const linkedRequestId = Number(userApplication.service_request_id || userApplication.response_meta?.service_request_id || 0)
    if (!Number.isFinite(linkedRequestId) || linkedRequestId <= 0) {
      toast({
        title: 'Payment unavailable',
        description: 'This application is not linked to a service request yet.',
        variant: 'destructive'
      })
      return
    }

    if (!(window as any).Razorpay) {
      toast({
        title: 'Razorpay unavailable',
        description: 'Payment SDK failed to load. Please refresh and try again.',
        variant: 'destructive'
      })
      return
    }

    setPaying(true)
    try {
      const orderResponse = await fetch(`/api/service-offers/${offerId}/clients/${user.id}/payments/create-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      })

      const orderPayload = await orderResponse.json()
      if (!orderResponse.ok || !orderPayload?.success || !orderPayload?.data?.paymentRequired) {
        toast({
          title: 'Unable to start payment',
          description: orderPayload?.error || 'This application does not require payment.',
          variant: 'destructive'
        })
        return
      }

      const orderData = orderPayload.data
      const razorpay = new (window as any).Razorpay({
        key: orderData.keyId,
        amount: Math.round(orderData.amount * 100),
        currency: orderData.currency,
        name: 'Navadrishti',
        description: `Payment for ${offer.title}`,
        order_id: orderData.orderId,
        prefill: {
          name: user.name || '',
          email: user.email || ''
        },
        theme: { color: '#2563eb' },
        handler: async (response: any) => {
          const verifyResponse = await fetch(`/api/service-offers/${offerId}/clients/${user.id}/payments/verify`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(response)
          })

          const verifyPayload = await verifyResponse.json()
          if (!verifyResponse.ok || !verifyPayload?.success) {
            toast({
              title: 'Payment verification failed',
              description: verifyPayload?.error || 'Please contact support with the payment reference.',
              variant: 'destructive'
            })
            return
          }

          toast({
            title: 'Payment successful',
            description: verifyPayload?.data?.message || 'Your linked service request has been updated.'
          })

          checkExistingApplication()
          fetchOfferDetails()
        }
      })

      razorpay.open()
    } catch (error) {
      console.error('Error starting offer payment:', error)
      toast({
        title: 'Payment failed',
        description: 'Could not complete the payment flow.',
        variant: 'destructive'
      })
    } finally {
      setPaying(false)
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
            <div className="h-5 w-44 rounded-md bg-gray-200 animate-pulse"></div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-12">
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div className="grid w-full grid-cols-3 gap-2">
                    <div className="h-10 rounded-md bg-gray-200 animate-pulse" />
                    <div className="h-10 rounded-md bg-gray-200 animate-pulse" />
                    <div className="h-10 rounded-md bg-gray-200 animate-pulse" />
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="h-6 w-56 rounded-md bg-gray-200 animate-pulse" />
                      <div className="h-4 w-full rounded-md bg-gray-200 animate-pulse" />
                      <div className="h-4 w-11/12 rounded-md bg-gray-200 animate-pulse" />
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="rounded-md border border-slate-200 p-4 space-y-2">
                          <div className="h-3 w-24 rounded-md bg-gray-200 animate-pulse" />
                          <div className="h-5 w-4/5 rounded-md bg-gray-200 animate-pulse" />
                        </div>
                      ))}
                    </div>
                  </div>
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
    <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-blue-50 to-indigo-100">
      <Header />
      
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => router.back()} className="w-full justify-start px-0 text-blue-600 hover:text-blue-800 hover:bg-transparent active:bg-transparent focus-visible:bg-transparent focus-visible:ring-0 sm:w-auto">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-12 min-w-0">
            <Card>
              <CardContent className="pt-6">
                <Tabs defaultValue="details" className="w-full">
                  <TabsList className="flex w-full gap-2 overflow-x-auto pb-1">
                    <TabsTrigger value="details" className="shrink-0 whitespace-nowrap">Capability Details</TabsTrigger>
                    {canShowRespondTab ? <TabsTrigger value="respond" className="shrink-0 whitespace-nowrap">Apply for Offer</TabsTrigger> : null}
                    <TabsTrigger value="provider" className="shrink-0 whitespace-nowrap">Service Provider</TabsTrigger>
                  </TabsList>

                  <TabsContent value="details" className="mt-4">
                    <ServiceDetails
                      id={offer.id}
                      title={offer.title}
                      description={offer.description}
                      category={offer.category}
                      location={offer.location}
                      images={offer.images}
                      ngo_name={offer.provider_name || offer.ngo_name}
                      creator_id={offer.creator_id}
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

                  <TabsContent value="provider" className="mt-4 space-y-5">
                    <div className="flex items-start gap-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                      <div className="h-16 w-16 shrink-0 rounded-md bg-gray-100 flex items-center justify-center overflow-hidden">
                        {offer.provider_profile_image ? (
                          <img
                            src={offer.provider_profile_image}
                            alt={offer.provider_name || offer.ngo_name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center bg-gray-200">
                            <span className="text-lg font-semibold text-gray-700">{getInitials(offer.provider_name || offer.ngo_name)}</span>
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <h3 className="text-lg font-semibold leading-tight truncate">{offer.provider_name || offer.ngo_name}</h3>
                        <p className="mt-1 text-sm text-gray-500 capitalize">{offer.provider_type || 'ngo'}</p>
                        {isOfferExpired ? (
                          <Badge variant="destructive" className="mt-2 w-fit">Expired</Badge>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="rounded-lg border border-slate-200 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Coverage</p>
                        <p className="mt-1 text-sm font-medium text-slate-800">{offer.location_scope || offer.location || 'Not specified'}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contact</p>
                        <p className="mt-1 text-sm font-medium text-slate-800 break-words">{offer.contact_info || 'Not specified'}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-4 md:col-span-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Validity Ends</p>
                        <p className="mt-1 text-sm font-medium text-slate-800">{offer.valid_until ? formatDate(offer.valid_until) : 'Open-ended'}</p>
                      </div>
                    </div>
                  </TabsContent>

                  {canShowRespondTab ? (
                  <TabsContent value="respond" className="mt-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          Apply for Offer
                        </CardTitle>
                          </CardHeader>

                      <CardContent>
                  { !isAuthenticated ? (
                  <div className="text-center space-y-4">
                    <p className="text-muted-foreground">You need to be logged in to apply for this offer.</p>
                    <Button asChild className="w-full">
                      <Link href="/login">Log In</Link>
                    </Button>
                  </div>
                ) : !canApplyToOffer ? (
                  <Alert>
                    <XCircle className="h-4 w-4" />
                    <AlertDescription>
                      Offer owners cannot apply to their own capability listing.
                    </AlertDescription>
                  </Alert>
                ) : user && user.verification_status !== 'verified' ? (
                  <div className="space-y-4">
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        Account verification required to apply for offers.
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
                      <AlertDescription>
                        You have already applied to this capability.
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

                      {['accepted', 'active'].includes(userApplication.status) && userApplication.service_request_id ? (
                        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-blue-900">Payment linked to service request</p>
                              <p className="text-xs text-blue-700">
                                Request #{userApplication.service_request_id}{userApplication.response_meta?.payment_amount_inr ? ` • ${formatPrice(Number(userApplication.response_meta.payment_amount_inr))}` : ''}
                              </p>
                            </div>
                            <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                              {userApplication.response_meta?.payment_status === 'paid' ? 'Paid' : 'Pending'}
                            </Badge>
                          </div>

                          {userApplication.response_meta?.payment_status !== 'paid' && Number(userApplication.response_meta?.payment_amount_inr || offer.price_amount || 0) > 0 ? (
                            <Button onClick={handlePayForApplication} disabled={paying} className="w-full">
                              {paying ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Starting payment...
                                </>
                              ) : (
                                'Pay now'
                              )}
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {!isAuthenticated ? (
                      <div className="text-center space-y-4">
                        <p className="text-muted-foreground">You need to be logged in to apply for this offer.</p>
                        <Button asChild className="w-full">
                          <Link href="/login">Log In</Link>
                        </Button>
                      </div>
                    ) : !canApplyToOffer ? (
                      <Alert>
                        <XCircle className="h-4 w-4" />
                        <AlertDescription>
                          Only verified NGOs can apply from this offer details page.
                        </AlertDescription>
                      </Alert>
                    ) : user && user.verification_status !== 'verified' ? (
                      <div className="space-y-4">
                        <Alert>
                          <AlertTriangle className="h-4 w-4" />
                          <AlertDescription>
                            Account verification required to apply from the offer details page.
                          </AlertDescription>
                        </Alert>

                        <div className="p-4 bg-amber-50 border border-amber-200 rounded-md">
                          <div className="flex items-start gap-3">
                            <div className="text-amber-600"></div>
                            <div>
                              <p className="text-amber-800 font-medium text-sm">Verification Required</p>
                              <p className="text-amber-700 text-sm mt-1">
                                You need to complete identity verification before you can apply.
                                <Link href="/verification" className="underline font-medium ml-1 hover:text-amber-900">
                                  Complete verification now
                                </Link>
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-5">
                        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4" />
                                <span className="text-sm font-medium">Applying as NGO</span>
                              </div>
                          <p className="text-sm text-muted-foreground">
                                Select one or more of your active needs. The request will be linked to the selected needs only.
                          </p>
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <Label>Active needs</Label>
                            <span className="text-xs text-muted-foreground">
                              {selectedNeedIds.length ? `${selectedNeedIds.length} selected` : 'Choose at least one'}
                            </span>
                          </div>

                          {loadingNgoNeeds ? (
                            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                              Loading your active needs...
                            </div>
                          ) : ngoNeeds.length === 0 ? (
                            <Alert>
                              <AlertDescription>
                                You do not have any active needs yet. Create an active service request first, then return here to apply.
                              </AlertDescription>
                            </Alert>
                          ) : (
                            <div className="grid gap-3">
                              {ngoNeeds.map((need) => {
                                const isSelected = selectedNeedIds.includes(need.id)
                                const needAmount = Number(need.estimated_budget ?? need.target_amount ?? 0)
                                return (
                                  <label
                                    key={need.id}
                                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${isSelected ? 'border-blue-500 bg-blue-50' : 'hover:bg-muted/50'}`}
                                  >
                                    <Checkbox
                                      checked={isSelected}
                                      onCheckedChange={(checked) => {
                                        setSelectedNeedIds((current) => {
                                          if (checked) return [...new Set([...current, need.id])]
                                          return current.filter((value) => value !== need.id)
                                        })
                                      }}
                                      className="mt-0.5"
                                    />
                                    <div className="min-w-0 flex-1 space-y-1">
                                      <div className="flex items-start justify-between gap-3">
                                        <div>
                                          <p className="font-medium leading-tight">{need.title}</p>
                                          <p className="text-xs text-muted-foreground capitalize">
                                            {need.request_type || 'Need'} • {need.status}
                                          </p>
                                        </div>
                                        <Badge variant="secondary" className="shrink-0">
                                          {needAmount > 0 ? formatPrice(needAmount) : 'No budget'}
                                        </Badge>
                                      </div>
                                    </div>
                                  </label>
                                )
                              })}
                            </div>
                          )}
                        </div>

                        {selectedNeedSummaries.length > 0 ? (
                          <div className="rounded-lg border bg-white p-4 space-y-2">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm font-medium">Selected needs</span>
                              <span className="text-xs text-muted-foreground">Total {formatPrice(selectedNeedTotal)}</span>
                            </div>
                            <ul className="space-y-1 text-sm text-muted-foreground">
                              {selectedNeedSummaries.map((need) => (
                                <li key={need.id} className="flex items-center justify-between gap-3">
                                  <span className="truncate">{need.title}</span>
                                  <span>{formatPrice(Number(need.estimated_budget ?? need.target_amount ?? 0) || 0)}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        <Button 
                          onClick={handleApply} 
                          disabled={applying || loadingNgoNeeds || ngoNeeds.length === 0 || selectedNeedIds.length === 0 || (user && user.verification_status !== 'verified')}
                          className="w-full"
                        >
                          {applying ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Submitting...
                            </>
                          ) : user && user.verification_status !== 'verified' ? (
                            'Verification Required'
                          ) : ngoNeeds.length === 0 ? (
                            'No active needs available'
                          ) : (
                            'Submit Application'
                          )}
                        </Button>
                      </div>
                    )}
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