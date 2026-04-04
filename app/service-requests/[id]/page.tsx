'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, User, Building, MessageSquare, CheckCircle, XCircle, Loader2, AlertTriangle, IndianRupee } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/hooks/use-toast'
import { Header } from '@/components/header'
import { VerificationBadge } from '@/components/verification-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getRequestUrgencyLevel } from '@/lib/utils'

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
  requester?: {
    id?: number
    name?: string
    email?: string
    user_type?: string
    location?: string
    city?: string
    state_province?: string
    country?: string
    phone?: string
    pincode?: string
    ngo_size?: string
    profile_image?: string
    profile_data?: Record<string, any>
    industry?: string
    verification_status?: string
  }
  project?: {
    id?: string
    title?: string
    description?: string
    location?: string
    timeline?: string
    status?: string
  }
  status: 'active' | 'in_progress' | 'completed' | 'cancelled'
  created_at: string
  updated_at: string
}

type RequestType = 'financial' | 'material' | 'skill' | 'infrastructure' | 'other'

interface VolunteerApplication {
  id: number
  volunteer_id: number
  volunteer_type: 'individual' | 'company'
  application_message: string
  status: 'pending' | 'accepted' | 'rejected' | 'active' | 'completed' | 'cancelled'
  applied_at: string
  response_meta?: {
    ngo_decision_comment?: string | null
    ngo_decision_at?: string
    individual_done_at?: string | null
    ngo_confirmed_at?: string | null
  }
  fulfillment_amount?: number | null
  fulfillment_quantity?: number | null
  assigned_amount?: number | null
  assigned_quantity?: number | null
  fulfilled_amount?: number | null
  fulfilled_quantity?: number | null
  individual_receipt_url?: string | null
  ngo_receipt_url?: string | null
}

interface ApplicantEntry {
  id: number
  volunteer_id: number
  application_message: string
  status: 'pending' | 'accepted' | 'rejected' | 'active' | 'completed' | 'cancelled'
  applied_at: string
  response_meta?: {
    ngo_decision_comment?: string | null
    ngo_decision_at?: string
    individual_done_at?: string | null
    ngo_confirmed_at?: string | null
  }
  volunteer?: {
    id?: number
    name?: string
    email?: string
    user_type?: 'individual' | 'company' | 'ngo'
  }
}

declare global {
  interface Window {
    Razorpay?: any
  }
}

const parseAmountToInr = (value: unknown): number => {
  if (value === null || value === undefined) return 0
  const text = String(value).trim()
  if (!text) return 0
  const normalized = text.replace(/[^\d.-]/g, '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

export default function ServiceRequestDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user, token } = useAuth()
  const { toast } = useToast()
  
  const [paymentAmount, setPaymentAmount] = useState('1000')
  const [paying, setPaying] = useState(false)
  const [currentTimeMs, setCurrentTimeMs] = useState(() => Date.now())
  const [request, setRequest] = useState<ServiceRequest | null>(null)
  const [userApplication, setUserApplication] = useState<VolunteerApplication | null>(null)
  const [applicants, setApplicants] = useState<ApplicantEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [updatingApplicantId, setUpdatingApplicantId] = useState<number | null>(null)
  const [decisionComments, setDecisionComments] = useState<Record<number, string>>({})
  const [applicationMessage, setApplicationMessage] = useState('')
  const [applicationFulfillmentAmount, setApplicationFulfillmentAmount] = useState('')
  const [applicationFulfillmentQuantity, setApplicationFulfillmentQuantity] = useState('')
  const [applicantAllocations, setApplicantAllocations] = useState<Record<number, string>>({})
  const [applicantQuantities, setApplicantQuantities] = useState<Record<number, string>>({})
  const [receiptUploads, setReceiptUploads] = useState<Record<number, File | null>>({})
  const [ngoCompletionNotes, setNgoCompletionNotes] = useState<Record<number, string>>({})
  const [individualReceiptFile, setIndividualReceiptFile] = useState<File | null>(null)
  const [individualCompletionNote, setIndividualCompletionNote] = useState('')

  const requestId = params.id as string
  const isAuthenticated = !!(user && token)
  const isNgoOwner = user?.user_type === 'ngo' && request?.ngo_id === user?.id
  const canVolunteer = user?.user_type === 'individual'
  const canCompanyFulfillViaCSR = user?.user_type === 'company'

  useEffect(() => {
    if (requestId) {
      fetchRequestDetails()
      if (isAuthenticated && user) {
        if (user.user_type === 'ngo') {
          fetchApplicants()
        } else if (user.user_type === 'individual') {
          checkExistingApplication()
        }
      }
    }
  }, [requestId, isAuthenticated, user])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.Razorpay) return

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
    const interval = setInterval(() => {
      setCurrentTimeMs(Date.now())
    }, 60 * 1000)

    return () => clearInterval(interval)
  }, [])

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

  const fetchApplicants = async () => {
    try {
      if (!token) return

      const response = await fetch(`/api/service-requests/${requestId}/volunteers`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (!response.ok) {
        return
      }

      const data = await response.json()
      if (data.success && Array.isArray(data.data)) {
        setApplicants(data.data)
      }
    } catch (error) {
      console.error('Error fetching applicants:', error)
    }
  }

  const handleApplicantDecision = async (applicant: ApplicantEntry, nextStatus: 'accepted' | 'rejected') => {
    if (!token) return

    const decisionComment = (decisionComments[applicant.id] || '').trim()
    const allocationAmount = applicantAllocations[applicant.id] || ''
    const allocationQuantity = applicantQuantities[applicant.id] || ''

    setUpdatingApplicantId(applicant.id)
    try {
      const response = await fetch(`/api/service-requests/${requestId}/volunteers/${applicant.id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: nextStatus,
          decisionComment,
          allocationAmount,
          allocationQuantity
        })
      })

      const data = await response.json()
      if (!response.ok || !data.success) {
        toast({
          title: 'Update failed',
          description: data.error || 'Could not update applicant status',
          variant: 'destructive'
        })
        return
      }
      setApplicants((prev) =>
        prev.map((item) =>
          item.id === applicant.id
            ? {
                ...item,
                status: nextStatus,
                response_meta: {
                  ...(item.response_meta || {}),
                  ngo_decision_comment: nextStatus === 'rejected' ? decisionComment || null : null,
                  ngo_decision_at: new Date().toISOString()
                }
              }
            : item
        )
      )

      toast({
        title: nextStatus === 'accepted' ? 'Applicant accepted' : 'Applicant rejected',
        description: nextStatus === 'accepted'
          ? 'Applicant has been accepted.'
          : 'Applicant has been rejected.'
      })
    } catch (error) {
      console.error('Error updating applicant decision:', error)
      toast({
        title: 'Update failed',
        description: 'Could not update applicant status',
        variant: 'destructive'
      })
    } finally {
      setUpdatingApplicantId(null)
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
        description: "NGOs create requests. Individuals can volunteer, and companies can fulfill via CSR.",
        variant: "destructive"
      })
      return
    }

    if (user.user_type === 'company') {
      toast({
        title: "Use CSR Fulfillment",
        description: "Companies fulfill requests through CSR projects. Open your dashboard to continue.",
      })
      router.push(`/companies/dashboard?tab=service-requests&requestId=${requestId}`)
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

    if (isFinancialRequest && !applicationFulfillmentAmount.trim()) {
      toast({
        title: 'Fulfillment amount required',
        description: 'Enter how much you can contribute for this financial need.',
        variant: 'destructive'
      })
      return
    }

    if (!isFinancialRequest && !applicationFulfillmentQuantity.trim()) {
      toast({
        title: 'Fulfillment quantity required',
        description: 'Enter how much you can fulfill for this need.',
        variant: 'destructive'
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
          message: applicationMessage,
          fulfillment_amount: isFinancialRequest ? applicationFulfillmentAmount : null,
          fulfillment_quantity: isFinancialRequest ? null : applicationFulfillmentQuantity
        })
      })

      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setUserApplication(result.data)
          setApplicationMessage('')
          setApplicationFulfillmentAmount('')
          setApplicationFulfillmentQuantity('')
          toast({
            title: "Application Submitted",
            description: "Your application has been submitted successfully. You can view your applications in the 'My Applications' tab.",
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

  const handleMarkIndividualDone = async () => {
    if (!userApplication || !token) return

    try {
      let receiptUrl: string | undefined
      if (individualReceiptFile) {
        receiptUrl = await uploadReceiptFile(individualReceiptFile)
      }

      const response = await fetch(`/api/service-requests/${requestId}/volunteers/${userApplication.id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: 'completed',
          receiptUrl,
          completionNote: individualCompletionNote
        })
      })

      const data = await response.json()
      if (!response.ok || !data.success) {
        toast({ title: 'Update failed', description: data.error || 'Could not mark completion', variant: 'destructive' })
        return
      }

      setUserApplication(data.data)
      toast({ title: 'Done', description: 'Your fulfillment has been marked as done.' })
      fetchRequestDetails()
      checkExistingApplication()
    } catch (error: any) {
      toast({ title: 'Update failed', description: error?.message || 'Could not mark completion', variant: 'destructive' })
    }
  }

  const handleNgoConfirm = async (applicant: ApplicantEntry) => {
    if (!token) return

    try {
      let receiptUrl: string | undefined
      const receiptFile = receiptUploads[applicant.id]
      if (receiptFile) {
        receiptUrl = await uploadReceiptFile(receiptFile)
      }

      const response = await fetch(`/api/service-requests/${requestId}/volunteers/${applicant.id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: 'completed',
          receiptUrl,
          completionNote: ngoCompletionNotes[applicant.id] || ''
        })
      })

      const data = await response.json()
      if (!response.ok || !data.success) {
        toast({ title: 'Update failed', description: data.error || 'Could not confirm fulfillment', variant: 'destructive' })
        return
      }

      toast({ title: 'Receipt confirmed', description: 'The fulfillment was moved to history.' })
      fetchRequestDetails()
      fetchApplicants()
    } catch (error: any) {
      toast({ title: 'Update failed', description: error?.message || 'Could not confirm fulfillment', variant: 'destructive' })
    }
  }

  const handleContribute = async () => {
    if (!request || !token) return
    if (!canPayForRequest) return

    if (!window.Razorpay) {
      toast({
        title: 'Razorpay unavailable',
        description: 'Payment SDK failed to load. Please refresh and try again.',
        variant: 'destructive'
      })
      return
    }

    const requestedInr = parseAmountToInr(paymentAmount)
    if (requestedInr <= 0) {
      toast({ title: 'Invalid amount', description: 'Enter a valid contribution amount in INR.', variant: 'destructive' })
      return
    }

    setPaying(true)
    try {
      const orderRes = await fetch(`/api/service-requests/${request.id}/payments/create-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ amount: requestedInr })
      })

      const orderPayload = await orderRes.json()
      if (!orderRes.ok || !orderPayload?.success) {
        toast({
          title: 'Unable to start payment',
          description: orderPayload?.error || 'Failed to create payment order',
          variant: 'destructive'
        })
        return
      }

      const orderData = orderPayload.data
      const razorpay = new window.Razorpay({
        key: orderData.keyId,
        amount: Math.round(orderData.amount * 100),
        currency: orderData.currency,
        name: 'Navadrishti',
        description: `Contribution for: ${orderData.requestTitle}`,
        order_id: orderData.orderId,
        prefill: {
          name: user?.name || '',
          email: user?.email || ''
        },
        theme: {
          color: '#2563eb'
        },
        handler: async (response: any) => {
          const verifyRes = await fetch(`/api/service-requests/${request.id}/payments/verify`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
              ...response,
              amount: orderData.amount
            })
          })

          const verifyPayload = await verifyRes.json()
          if (!verifyRes.ok || !verifyPayload?.success) {
            toast({
              title: 'Payment verification failed',
              description: verifyPayload?.error || 'Please contact support with payment reference.',
              variant: 'destructive'
            })
            return
          }

          toast({
            title: 'Payment successful',
            description: verifyPayload?.data?.message || 'Contribution recorded successfully.'
          })

          fetchRequestDetails()
        }
      })

      razorpay.open()
    } catch (error) {
      console.error('Contribution error:', error)
      toast({ title: 'Payment failed', description: 'Could not complete payment flow.', variant: 'destructive' })
    } finally {
      setPaying(false)
    }
  }

  const getUrgencyTextColor = (urgency: string) => {
    if (!urgency) return 'text-gray-800';
    switch (urgency.toLowerCase()) {
      case 'critical': return 'text-red-900'
      case 'high': return 'text-red-800'
      case 'medium': return 'text-yellow-800'
      case 'low': return 'text-green-800'
      default: return 'text-gray-800'
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

  const parsedRequirements = (() => {
    if (!request?.requirements) return {}
    try {
      return typeof request.requirements === 'string'
        ? JSON.parse(request.requirements)
        : request.requirements
    } catch {
      return {}
    }
  })() as Record<string, any>

  const infoRequestType = String(parsedRequirements?.request_type || request?.category || 'Not specified')
  const infoBudget = String(parsedRequirements?.estimated_budget || parsedRequirements?.budget || 'Not specified')
  const infoBeneficiaries = Number(parsedRequirements?.beneficiary_count || 0)
  const infoImpact = String(parsedRequirements?.impact_description || 'Not specified')
  const linkedProject = request?.project || parsedRequirements?.project?.project || null
  const categoryDetails = parsedRequirements?.category_details || {}
  const rawDeadline = String(request?.deadline || request?.timeline || parsedRequirements?.timeline || 'Not specified')
  const infoDeadline = rawDeadline.trim().toLowerCase() === 'anytime' ? 'Anytime (No expiry)' : rawDeadline
  const effectiveUrgency = getRequestUrgencyLevel({
    createdAt: request?.created_at,
    deadline: request?.deadline || request?.timeline || parsedRequirements?.timeline,
    fallback: request?.urgency_level,
    referenceTimeMs: currentTimeMs
  })
  const isFinancialNeed = infoRequestType.toLowerCase().includes('financial')
  const fundingTargetInr = parseAmountToInr(parsedRequirements?.funding_target_inr || parsedRequirements?.estimated_budget || parsedRequirements?.budget)
  const fundsRaisedInr = parseAmountToInr(parsedRequirements?.funds_raised_inr)
  const fundsRemainingInr = Math.max(0, fundingTargetInr - fundsRaisedInr)
  const fundingProgress = fundingTargetInr > 0 ? Math.min(100, Math.round((fundsRaisedInr / fundingTargetInr) * 100)) : 0
  const canPayForRequest = Boolean(isAuthenticated && canVolunteer && !isNgoOwner && request?.status !== 'completed' && request?.status !== 'cancelled')
  const requesterProfile = request?.requester
  const requesterProfileData = requesterProfile?.profile_data || {}
  const requesterLocation = requesterProfile?.city && requesterProfile?.state_province
    ? `${requesterProfile.city}, ${requesterProfile.state_province}${requesterProfile.country ? `, ${requesterProfile.country}` : ''}`
    : requesterProfile?.location || request?.location || 'Location not set'
  const requesterPhone = requesterProfile?.phone || 'Phone not set'
  const requesterNgoSize = String(requesterProfile?.ngo_size || requesterProfileData.ngo_size || 'NGO size not set')
  const requesterSector = String(requesterProfileData.sector || requesterProfile?.industry || 'Sector not set')
  const requesterFounded = String(requesterProfileData.founded || requesterProfileData.founded_year || 'Founded year not set')
  const requesterPincode = requesterProfile?.pincode || 'Pincode not set'
  const isFinancialRequest = infoRequestType.toLowerCase().includes('financial')

  const uploadReceiptFile = async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch('/api/uploads/receipt', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData
    })

    const data = await response.json()
    if (!response.ok || !data?.success) {
      throw new Error(data?.error || 'Failed to upload receipt')
    }

    return data.data?.url as string
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
                  <div className="h-6 w-48 rounded bg-gray-200 animate-pulse" />
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="h-28 w-28 md:h-32 md:w-32 rounded-lg bg-gray-200 animate-pulse mx-auto" />

                  <div className="space-y-2">
                    <div className="h-6 w-3/4 rounded bg-gray-200 animate-pulse" />
                    <div className="h-4 w-2/3 rounded bg-gray-200 animate-pulse" />
                  </div>

                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="space-y-2">
                          <div className="h-3 w-20 rounded bg-gray-200 animate-pulse" />
                          <div className="h-4 w-full rounded bg-gray-200 animate-pulse" />
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {Array.from({ length: 2 }).map((_, i) => (
                        <div key={i} className="space-y-2">
                          <div className="h-3 w-24 rounded bg-gray-200 animate-pulse" />
                          <div className="h-4 w-full rounded bg-gray-200 animate-pulse" />
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-8">
              <Card>
                <CardHeader>
                  <div className="h-6 w-64 rounded bg-gray-200 animate-pulse" />
                </CardHeader>

                <CardContent>
                  <div className="grid w-full grid-cols-2 gap-2 mb-4">
                    <div className="h-10 rounded bg-gray-200 animate-pulse" />
                    <div className="h-10 rounded bg-gray-200 animate-pulse" />
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="h-4 w-24 rounded bg-gray-200 animate-pulse" />
                      <div className="h-7 w-2/3 rounded bg-gray-200 animate-pulse" />
                    </div>

                    <div className="space-y-2">
                      <div className="h-4 w-28 rounded bg-gray-200 animate-pulse" />
                      <div className="h-4 w-full rounded bg-gray-200 animate-pulse" />
                      <div className="h-4 w-11/12 rounded bg-gray-200 animate-pulse" />
                      <div className="h-4 w-10/12 rounded bg-gray-200 animate-pulse" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="space-y-2">
                          <div className="h-4 w-24 rounded bg-gray-200 animate-pulse" />
                          <div className="h-5 w-3/4 rounded bg-gray-200 animate-pulse" />
                        </div>
                      ))}
                    </div>

                    <div className="space-y-2">
                      <div className="h-4 w-36 rounded bg-gray-200 animate-pulse" />
                      <div className="h-4 w-full rounded bg-gray-200 animate-pulse" />
                      <div className="h-4 w-10/12 rounded bg-gray-200 animate-pulse" />
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

  if (!request) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <Header />
        <div className="mx-auto max-w-7xl px-4 py-8">
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
      
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="ghost" onClick={() => router.back()} className="w-full justify-start px-0 text-blue-600 hover:text-blue-800 hover:bg-transparent active:bg-transparent focus-visible:bg-transparent focus-visible:ring-0 sm:w-auto">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          {isNgoOwner && (
            <Link href={`/service-requests/edit/${request.id}`}>
              <Button variant="outline" className="w-full sm:w-auto">Edit Request</Button>
            </Link>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-4">
            <Card className="lg:sticky lg:top-20">
              <CardHeader>
                <CardTitle>Requesting Organization</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="h-28 w-28 md:h-32 md:w-32 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden mx-auto">
                  {requesterProfile?.profile_image ? (
                    <img
                      src={requesterProfile.profile_image}
                      alt={request.ngo_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Building className="h-12 w-12 text-gray-400" />
                  )}
                </div>

                <div>
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <span>{request.ngo_name}</span>
                    <VerificationBadge
                      status={request.requester?.verification_status || 'unverified'}
                      size="sm"
                      showText={false}
                    />
                  </h3>
                  <p className="text-sm text-gray-500">{requesterProfile?.email || 'Email not set'}</p>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-500">Location</p>
                      <p>{requesterLocation}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Phone</p>
                      <p>{requesterPhone}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">NGO Size</p>
                      <p>{requesterNgoSize}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Sector</p>
                      <p>{requesterSector}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-500">Founded Year</p>
                      <p>{requesterFounded}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Pincode</p>
                      <p>{requesterPincode}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-8">
            <Card>
              <CardHeader>
                <CardTitle>Request Details & Volunteering</CardTitle>
              </CardHeader>

              <CardContent>
                <Tabs defaultValue="details" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="details">Request Details</TabsTrigger>
                    <TabsTrigger value="volunteer">{user?.user_type === 'ngo' ? 'Applicants' : 'Volunteer'}</TabsTrigger>
                  </TabsList>

                  <TabsContent value="details" className="mt-4 space-y-4">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-gray-500">Title</p>
                      <p className="font-semibold text-lg">{request.title}</p>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-medium text-gray-500">Description</p>
                      <p className="text-sm text-muted-foreground">{request.description}</p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                      <div>
                        <p className="font-medium text-gray-500">Request Type</p>
                        <p className="font-semibold">{infoRequestType}</p>
                      </div>
                      <div>
                        <p className="font-medium text-gray-500">Location</p>
                        <p className="font-semibold">{request.location || 'Not specified'}</p>
                      </div>
                      <div>
                        <p className="font-medium text-gray-500">Deadline</p>
                        <p className="font-semibold">{infoDeadline}</p>
                      </div>
                      <div>
                        <p className="font-medium text-gray-500">Urgency</p>
                        <p className={`font-semibold ${getUrgencyTextColor(effectiveUrgency)}`}>
                          {effectiveUrgency.toUpperCase()}
                        </p>
                      </div>
                      <div>
                        <p className="font-medium text-gray-500">Budget</p>
                        <p className="font-semibold">{infoBudget}</p>
                      </div>
                      <div>
                        <p className="font-medium text-gray-500">Beneficiaries</p>
                        <p className="font-semibold">{infoBeneficiaries > 0 ? infoBeneficiaries : 'Not specified'}</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-medium text-gray-500">Impact Description</p>
                      <p className="text-sm text-muted-foreground">{infoImpact}</p>
                    </div>

                    {linkedProject && (
                      <div className="space-y-3 rounded-lg border p-4 bg-muted/30">
                        <div>
                          <p className="text-sm font-medium text-gray-500">Project Context</p>
                          <p className="font-semibold">{linkedProject.title || 'Project'}</p>
                        </div>
                        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                          <div>
                            <p className="text-gray-500">Project Location</p>
                            <p className="font-medium">{linkedProject.location || request.location || 'Not specified'}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Project Timeline</p>
                            <p className="font-medium">{linkedProject.timeline || infoDeadline}</p>
                          </div>
                          {linkedProject.description && (
                            <div className="md:col-span-2">
                              <p className="text-gray-500">Project Description</p>
                              <p className="font-medium text-muted-foreground">{linkedProject.description}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {Object.keys(categoryDetails || {}).length > 0 && (
                      <div className="space-y-3 rounded-lg border p-4">
                        <p className="text-sm font-medium text-gray-500">Request Specific Details</p>
                        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                          {categoryDetails.material_items && (
                            <div>
                              <p className="text-gray-500">Material Items</p>
                              <p className="font-medium">{categoryDetails.material_items}</p>
                            </div>
                          )}
                          {categoryDetails.skill_role && (
                            <div>
                              <p className="text-gray-500">Skill Role</p>
                              <p className="font-medium">{categoryDetails.skill_role}</p>
                            </div>
                          )}
                          {categoryDetails.skill_duration && (
                            <div>
                              <p className="text-gray-500">Skill Duration</p>
                              <p className="font-medium">{categoryDetails.skill_duration}</p>
                            </div>
                          )}
                          {categoryDetails.infrastructure_scope && (
                            <div className="md:col-span-2">
                              <p className="text-gray-500">Infrastructure Scope</p>
                              <p className="font-medium text-muted-foreground">{categoryDetails.infrastructure_scope}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {isFinancialNeed && (
                      <div className="space-y-3 rounded-lg border p-4">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold">Funding Progress</p>
                          <Badge className={request.status === 'completed' ? 'bg-green-100 text-green-800 border-green-200' : 'bg-blue-100 text-blue-800 border-blue-200'}>
                            {request.status === 'completed' ? 'Fulfilled' : `${fundingProgress}% Funded`}
                          </Badge>
                        </div>

                        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                          <div className="h-full bg-emerald-500" style={{ width: `${fundingProgress}%` }} />
                        </div>

                        <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                          <div>
                            <p className="text-gray-500">Target</p>
                            <p className="font-semibold">INR {fundingTargetInr.toLocaleString('en-IN')}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Raised</p>
                            <p className="font-semibold text-emerald-700">INR {fundsRaisedInr.toLocaleString('en-IN')}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Remaining</p>
                            <p className="font-semibold">INR {fundsRemainingInr.toLocaleString('en-IN')}</p>
                          </div>
                        </div>

                        {canPayForRequest && fundingTargetInr > 0 && fundsRemainingInr > 0 && (
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <div className="relative w-full sm:max-w-[220px]">
                              <IndianRupee className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                              <input
                                type="number"
                                min={1}
                                max={Math.ceil(fundsRemainingInr)}
                                value={paymentAmount}
                                onChange={(e) => setPaymentAmount(e.target.value)}
                                className="h-10 w-full rounded-md border px-9 text-sm"
                                placeholder="Amount"
                              />
                            </div>
                            <Button onClick={handleContribute} disabled={paying}>
                              {paying ? 'Starting Payment...' : 'Pay with Razorpay'}
                            </Button>
                          </div>
                        )}

                        {!canPayForRequest && request.status !== 'completed' && (
                          <p className="text-xs text-muted-foreground">
                            Verified individuals can contribute directly to Financial Need requests. Companies should fulfill via CSR projects.
                          </p>
                        )}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="volunteer" className="mt-4">
                    {!isAuthenticated ? (
                      <div className="text-center space-y-4">
                        <p className="text-muted-foreground">Log in to volunteer (individual) or fulfill via CSR (company).</p>
                        <Button asChild className="w-full">
                          <Link href="/login">Log In</Link>
                        </Button>
                      </div>
                    ) : isNgoOwner ? (
                      <div className="space-y-4">
                        {applicants.length === 0 ? (
                          <Alert>
                            <MessageSquare className="h-4 w-4" />
                            <AlertDescription>
                              No applications yet for this request.
                            </AlertDescription>
                          </Alert>
                        ) : (
                          applicants.map((applicant) => (
                            <div key={applicant.id} className="rounded-lg border p-4 space-y-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-semibold">{applicant.volunteer?.name || 'Applicant'}</p>
                                  <p className="text-sm text-muted-foreground">{applicant.volunteer?.email || 'Email not available'}</p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Applied on {new Date(applicant.applied_at).toLocaleDateString()}
                                  </p>
                                </div>
                                <Badge className={getStatusColor(applicant.status)}>
                                  {applicant.status ? applicant.status.charAt(0).toUpperCase() + applicant.status.slice(1) : 'Pending'}
                                </Badge>
                              </div>

                              <div className="space-y-1">
                                <p className="text-sm font-medium">Application Message</p>
                                <p className="text-sm whitespace-pre-wrap rounded bg-muted p-3">{applicant.application_message || 'No message provided.'}</p>
                              </div>

                              {applicant.status === 'rejected' && applicant.response_meta?.ngo_decision_comment && (
                                <div className="space-y-1">
                                  <p className="text-sm font-medium text-red-700">Rejection Comment</p>
                                  <p className="text-sm whitespace-pre-wrap rounded border border-red-200 bg-red-50 p-3 text-red-800">
                                    {applicant.response_meta.ngo_decision_comment}
                                  </p>
                                </div>
                              )}

                              <div className="space-y-2">
                                <Label htmlFor={`comment-${applicant.id}`}>Decision Comment (optional)</Label>
                                <Textarea
                                  id={`comment-${applicant.id}`}
                                  placeholder="Optional note for applicant (especially useful when rejecting)"
                                  value={decisionComments[applicant.id] || ''}
                                  onChange={(e) =>
                                    setDecisionComments((prev) => ({
                                      ...prev,
                                      [applicant.id]: e.target.value
                                    }))
                                  }
                                  rows={2}
                                />
                              </div>

                              {applicant.status === 'pending' && (
                                <div className="grid gap-4 md:grid-cols-2">
                                  <div>
                                    <Label htmlFor={`allocation-${applicant.id}`}>
                                      {isFinancialNeed ? 'Acceptable Amount' : 'Acceptable Quantity'}
                                    </Label>
                                    <Input
                                      id={`allocation-${applicant.id}`}
                                      type="number"
                                      min="1"
                                      value={isFinancialNeed ? (applicantAllocations[applicant.id] || '') : (applicantQuantities[applicant.id] || '')}
                                      onChange={(e) => {
                                        if (isFinancialNeed) {
                                          setApplicantAllocations((prev) => ({ ...prev, [applicant.id]: e.target.value }))
                                        } else {
                                          setApplicantQuantities((prev) => ({ ...prev, [applicant.id]: e.target.value }))
                                        }
                                      }}
                                      placeholder={isFinancialNeed ? 'e.g., 5000' : 'e.g., 10'}
                                    />
                                  </div>
                                  <div className="text-xs text-muted-foreground self-end">
                                    Fill this with the exact amount or quantity this applicant can handle.
                                  </div>
                                </div>
                              )}

                              {(applicant.response_meta?.individual_done_at || applicant.response_meta?.ngo_confirmed_at) && (
                                <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                                  <div className="text-sm font-medium">Completion Tracking</div>
                                  <div className="grid gap-3 md:grid-cols-2">
                                    <div>
                                      <Label htmlFor={`ngo-receipt-${applicant.id}`}>Receipt Upload</Label>
                                      <Input
                                        id={`ngo-receipt-${applicant.id}`}
                                        type="file"
                                        accept="image/*,.pdf"
                                        onChange={(e) => setReceiptUploads((prev) => ({ ...prev, [applicant.id]: e.target.files?.[0] || null }))}
                                      />
                                    </div>
                                    <div>
                                      <Label htmlFor={`ngo-note-${applicant.id}`}>Confirmation Note</Label>
                                      <Textarea
                                        id={`ngo-note-${applicant.id}`}
                                        value={ngoCompletionNotes[applicant.id] || ''}
                                        onChange={(e) => setNgoCompletionNotes((prev) => ({ ...prev, [applicant.id]: e.target.value }))}
                                        rows={2}
                                      />
                                    </div>
                                  </div>
                                </div>
                              )}

                              {applicant.status === 'pending' ? (
                                <div className="flex flex-col sm:flex-row gap-2">
                                  <Button
                                    onClick={() => handleApplicantDecision(applicant, 'accepted')}
                                    disabled={updatingApplicantId === applicant.id}
                                  >
                                    {updatingApplicantId === applicant.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      'Accept'
                                    )}
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    onClick={() => handleApplicantDecision(applicant, 'rejected')}
                                    disabled={updatingApplicantId === applicant.id}
                                  >
                                    {updatingApplicantId === applicant.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      'Reject'
                                    )}
                                  </Button>
                                </div>
                              ) : applicant.response_meta?.individual_done_at && !applicant.response_meta?.ngo_confirmed_at ? (
                                <div className="flex flex-col sm:flex-row gap-2">
                                  <Button onClick={() => handleNgoConfirm(applicant)} disabled={updatingApplicantId === applicant.id}>
                                    Confirm Receipt
                                  </Button>
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground">
                                  This application has already been reviewed.
                                </p>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    ) : canCompanyFulfillViaCSR ? (
                      <div className="space-y-4">
                        <Alert>
                          <Building className="h-4 w-4" />
                          <AlertDescription>
                            Companies fulfill NGO needs through CSR execution projects, not volunteer applications.
                          </AlertDescription>
                        </Alert>

                        <Button asChild className="w-full">
                          <Link href={`/companies/dashboard?tab=service-requests&requestId=${requestId}`}>
                            Fulfill This Need via CSR
                          </Link>
                        </Button>
                      </div>
                    ) : !canVolunteer ? (
                      <Alert>
                        <XCircle className="h-4 w-4" />
                        <AlertDescription>
                          NGOs create requests. Verified individuals can volunteer. Companies can fulfill via CSR.
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
                                You need to complete identity verification (Aadhaar & PAN) before you can apply for volunteer opportunities.
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
                              {userApplication.status
                                ? userApplication.status.charAt(0).toUpperCase() + userApplication.status.slice(1)
                                : 'Pending'}
                            </Badge>
                          </div>

                          <div>
                            <span className="text-sm font-medium">Your Message:</span>
                            <p className="text-sm text-muted-foreground mt-1 p-2 bg-muted rounded">
                              {userApplication.application_message}
                            </p>
                          </div>

                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
                            <div>
                              <span className="font-medium">Your Fulfillment:</span>
                              <p className="mt-1 p-2 bg-muted rounded">
                                {isFinancialNeed
                                  ? `INR ${Number(userApplication.fulfillment_amount || userApplication.assigned_amount || 0).toLocaleString('en-IN')}`
                                  : String(userApplication.fulfillment_quantity || userApplication.assigned_quantity || 0)}
                              </p>
                            </div>
                            <div>
                              <span className="font-medium">Receipt Status:</span>
                              <p className="mt-1 p-2 bg-muted rounded">
                                {userApplication.response_meta?.individual_done_at ? 'Marked done' : 'Pending completion'}
                              </p>
                            </div>
                          </div>

                          {(userApplication.status === 'accepted' || userApplication.status === 'active') && (
                            <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                              <div>
                                <p className="font-medium text-sm">Mark Fulfillment Done</p>
                                <p className="text-xs text-muted-foreground">Upload your receipt and confirm once your part is complete.</p>
                              </div>
                              <div className="grid gap-3 md:grid-cols-2">
                                <div>
                                  <Label htmlFor="individual-receipt">Receipt Upload</Label>
                                  <Input id="individual-receipt" type="file" accept="image/*,.pdf" onChange={(e) => setIndividualReceiptFile(e.target.files?.[0] || null)} />
                                </div>
                                <div>
                                  <Label htmlFor="individual-note">Completion Note</Label>
                                  <Textarea id="individual-note" value={individualCompletionNote} onChange={(e) => setIndividualCompletionNote(e.target.value)} rows={2} placeholder="Optional note about the completed fulfillment" />
                                </div>
                              </div>
                              <Button onClick={handleMarkIndividualDone} className="w-full">
                                Mark as Done
                              </Button>
                            </div>
                          )}

                          {userApplication.status === 'rejected' && userApplication.response_meta?.ngo_decision_comment && (
                            <div>
                              <span className="text-sm font-medium text-red-700">Reason from NGO:</span>
                              <p className="text-sm text-red-800 mt-1 p-2 bg-red-50 border border-red-200 rounded whitespace-pre-wrap">
                                {userApplication.response_meta.ngo_decision_comment}
                              </p>
                            </div>
                          )}

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
                            Applying as Individual
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

                        <div className="grid gap-4 md:grid-cols-2">
                          {isFinancialNeed ? (
                            <div>
                              <Label htmlFor="fulfillment_amount">Amount You Can Fulfill *</Label>
                              <Input
                                id="fulfillment_amount"
                                type="number"
                                min="1"
                                value={applicationFulfillmentAmount}
                                onChange={(e) => setApplicationFulfillmentAmount(e.target.value)}
                                placeholder="e.g., 5000"
                                required
                              />
                            </div>
                          ) : (
                            <div>
                              <Label htmlFor="fulfillment_quantity">Quantity You Can Fulfill *</Label>
                              <Input
                                id="fulfillment_quantity"
                                type="number"
                                min="1"
                                value={applicationFulfillmentQuantity}
                                onChange={(e) => setApplicationFulfillmentQuantity(e.target.value)}
                                placeholder="e.g., 10"
                                required
                              />
                            </div>
                          )}
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
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}