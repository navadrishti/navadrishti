'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/utils'
import { uploadReceiptFile } from './helpers'
import type { VolunteerApplication } from './types'

interface UseVolunteerApplicationOptions {
  requestId: string
  userApplication: VolunteerApplication | null
  setUserApplication: (application: VolunteerApplication | null) => void
  isFinancialRequest: boolean
  isSkillServiceNeed: boolean
  fetchRequestDetails: () => Promise<void>
  checkExistingApplication: () => Promise<void>
}

export function useVolunteerApplication({
  requestId,
  userApplication,
  setUserApplication,
  isFinancialRequest,
  isSkillServiceNeed,
  fetchRequestDetails,
  checkExistingApplication,
}: UseVolunteerApplicationOptions) {
  const router = useRouter()
  const { user, token } = useAuth()
  const { toast } = useToast()
  const [applying, setApplying] = useState(false)
  const [applicationMessage, setApplicationMessage] = useState('')
  const [applicationFulfillmentAmount, setApplicationFulfillmentAmount] = useState('')
  const [applicationFulfillmentQuantity, setApplicationFulfillmentQuantity] = useState('')
  const [individualReceiptFile, setIndividualReceiptFile] = useState<File | null>(null)
  const [individualCompletionNote, setIndividualCompletionNote] = useState('')
  const [individualDeliveryTrackingId, setIndividualDeliveryTrackingId] = useState('')
  const [syncingOwnTracking, setSyncingOwnTracking] = useState(false)

  const isAuthenticated = !!(user && token)

  const handleApply = async () => {
    if (!isAuthenticated || !user) {
      toast({
        title: 'Authentication Required',
        description: 'Please log in to apply for this need',
        variant: 'destructive'
      })
      router.push('/login')
      return
    }

    if (user.user_type === 'ngo') {
      toast({
        title: 'Invalid User Type',
        description: 'NGOs create needs. Individuals can volunteer, and companies can fulfill via CSR.',
        variant: 'destructive'
      })
      return
    }

    if (user.user_type === 'company') {
      toast({
        title: 'Use CSR Fulfillment',
        description: 'Companies fulfill requests through CSR projects. Open your dashboard to continue.',
      })
      router.push(`/companies/dashboard?tab=service-requests&requestId=${requestId}`)
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

    if (isSkillServiceNeed && !applicationFulfillmentAmount.trim()) {
      toast({
        title: 'Daily rate required',
        description: 'Enter your quoted INR rate per day for this skill/service need.',
        variant: 'destructive'
      })
      return
    }

    if (!isFinancialRequest && !isSkillServiceNeed && !applicationFulfillmentQuantity.trim()) {
      toast({
        title: 'Fulfillment quantity required',
        description: 'Enter how much you can fulfill for this need.',
        variant: 'destructive'
      })
      return
    }

    setApplying(true)

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const response = await fetch(`/api/service-requests/${requestId}/volunteers`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: applicationMessage,
          fulfillment_amount: isFinancialRequest || isSkillServiceNeed ? applicationFulfillmentAmount : null,
          fulfillment_quantity: isFinancialRequest || isSkillServiceNeed ? null : applicationFulfillmentQuantity
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
            title: 'Application Submitted',
            description: "Your application has been submitted successfully. You can view your applications in the 'Invitations' tab.",
          })

          setTimeout(() => {
            router.push('/service-requests?tab=volunteering')
          }, 2000)
        } else {
          toast({
            title: 'Application Failed',
            description: result.error || 'Failed to submit application',
            variant: 'destructive'
          })
        }
      } else {
        const error = await response.json()
        const errorMsg = error.error || 'Failed to submit application'

        if (error.requiresVerification) {
          const verificationMessage = error.message || 'Please complete account verification before applying for volunteer opportunities.'
          toast({
            title: 'Verification Required',
            description: verificationMessage,
            variant: 'destructive'
          })
          setTimeout(() => {
            router.push('/verification')
          }, 3000)
        } else {
          toast({
            title: 'Application Failed',
            description: errorMsg,
            variant: 'destructive'
          })
        }
      }
    } catch (error) {
      console.error('Error applying:', error)
      toast({
        title: 'Error',
        description: 'Failed to submit application',
        variant: 'destructive'
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
        receiptUrl = await uploadReceiptFile(individualReceiptFile, token)
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
          completionNote: individualCompletionNote,
          deliveryTrackingId: individualDeliveryTrackingId.trim() || undefined
        })
      })

      const data = await response.json()
      if (!response.ok || !data.success) {
        toast({ title: 'Update failed', description: data.error || 'Could not mark completion', variant: 'destructive' })
        return
      }

      setUserApplication(data.data)
      setIndividualDeliveryTrackingId('')
      toast({ title: 'Done', description: 'Your fulfillment has been marked as done.' })
      fetchRequestDetails()
      checkExistingApplication()
    } catch (error) {
      toast({ title: 'Update failed', description: getErrorMessage(error) || 'Could not mark completion', variant: 'destructive' })
    }
  }

  const syncOwnDelivery = async () => {
    if (!userApplication || !token) return

    const trackingId = (individualDeliveryTrackingId || userApplication.response_meta?.delivery_tracking_id || '').trim()
    if (!trackingId) {
      toast({ title: 'Tracking ID required', description: 'Enter or save a Delhivery tracking ID first.', variant: 'destructive' })
      return
    }

    setSyncingOwnTracking(true)
    try {
      const response = await fetch(`/api/service-requests/${requestId}/volunteers/${userApplication.id}/delivery/sync`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ trackingId })
      })

      const data = await response.json()
      if (!response.ok || !data?.success) {
        toast({ title: 'Sync failed', description: data?.error || 'Could not fetch Delhivery status', variant: 'destructive' })
        return
      }

      const updatedAssignment = data?.data?.assignment
      if (updatedAssignment) {
        setUserApplication(updatedAssignment)
      }

      toast({ title: 'Tracking synced', description: 'Latest Delhivery shipment status has been updated.' })
    } catch (error) {
      toast({ title: 'Sync failed', description: getErrorMessage(error) || 'Could not fetch Delhivery status', variant: 'destructive' })
    } finally {
      setSyncingOwnTracking(false)
    }
  }

  return {
    applying,
    applicationMessage,
    setApplicationMessage,
    applicationFulfillmentAmount,
    setApplicationFulfillmentAmount,
    applicationFulfillmentQuantity,
    setApplicationFulfillmentQuantity,
    setIndividualReceiptFile,
    individualCompletionNote,
    setIndividualCompletionNote,
    individualDeliveryTrackingId,
    setIndividualDeliveryTrackingId,
    syncingOwnTracking,
    handleApply,
    handleMarkIndividualDone,
    syncOwnDelivery,
  }
}

export type VolunteerApplicationActions = ReturnType<typeof useVolunteerApplication>
