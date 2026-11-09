'use client'
import { toast } from 'sonner'

import { readApiError } from '@/lib/user-facing-error'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
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
  const { user, token } = useAuth()  const [applying, setApplying] = useState(false)
  const [applicationMessage, setApplicationMessage] = useState('')
  const [applicationFulfillmentAmount, setApplicationFulfillmentAmount] = useState('')
  const [applicationFulfillmentQuantity, setApplicationFulfillmentQuantity] = useState('')
  const [individualReceiptFile, setIndividualReceiptFile] = useState<File | null>(null)
  const [individualCompletionNote, setIndividualCompletionNote] = useState('')
  const isAuthenticated = !!(user && token)

  const handleApply = async () => {
    if (!isAuthenticated || !user) {
      toast.error('Authentication Required', { description: 'Please log in to apply for this need' })
      router.push('/login')
      return
    }

    if (user.user_type === 'ngo') {
      toast.error('Invalid User Type', { description: 'NGOs create needs. Individuals volunteer to fulfill them.' })
      return
    }

    if (user.user_type === 'company') {
      toast.success('Needs are for individuals', { description: 'Companies fulfill through CSR projects, not marketplace needs.' })
      router.push('/companies/dashboard')
      return
    }

    if (isFinancialRequest && !applicationFulfillmentAmount.trim()) {
      toast.error('Fulfillment amount required', { description: 'Enter how much you can contribute for this financial need.' })
      return
    }

    if (isSkillServiceNeed && !applicationFulfillmentAmount.trim()) {
      toast.error('Daily rate required', { description: 'Enter your quoted INR rate per day for this skill/service need.' })
      return
    }

    if (!isFinancialRequest && !isSkillServiceNeed && !applicationFulfillmentQuantity.trim()) {
      toast.error('Fulfillment quantity required', { description: 'Enter how much you can fulfill for this need.' })
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
          toast.success('Application Submitted', { description: "Your application has been submitted successfully. You can view your applications in the 'Invitations' tab." })

          setTimeout(() => {
            router.push(user.user_type === 'ngo' ? '/ngos/dashboard' : '/individuals/dashboard')
          }, 2000)
        } else {
          toast.error('Application Failed', { description: readApiError(result, 'Failed to submit application') })
        }
      } else {
        const error = await response.json()
        const errorMsg = readApiError(error, 'Failed to submit application')

        if (error.requiresVerification) {
          const verificationMessage = typeof error.message === 'string' && error.message.trim()
            ? error.message
            : 'Please complete account verification before applying for volunteer opportunities.'
          toast.error('Verification Required', { description: verificationMessage })
          setTimeout(() => {
            router.push('/verification')
          }, 3000)
        } else {
          toast.error('Application Failed', { description: errorMsg })
        }
      }
    } catch (error) {
      console.error('Error applying:', error)
      toast.error('Error', { description: 'Failed to submit application' })
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
        })
      })

      const data = await response.json()
      if (!response.ok || !data.success) {
        toast.error('Update failed', { description: readApiError(data, 'Could not mark completion') })
        return
      }

      setUserApplication(data.data)
      toast.success('Done', { description: 'Your fulfillment has been marked as done.' })
      fetchRequestDetails()
      checkExistingApplication()
    } catch (error) {
      toast.error('Update failed', { description: getErrorMessage(error) || 'Could not mark completion' })
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
    handleApply,
    handleMarkIndividualDone,
  }
}

export type VolunteerApplicationActions = ReturnType<typeof useVolunteerApplication>
