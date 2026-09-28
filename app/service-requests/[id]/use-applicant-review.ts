'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/utils'
import { uploadReceiptFile } from './helpers'
import type { ApplicantEntry, ServiceRequest } from './types'

interface UseApplicantReviewOptions {
  requestId: string
  request: ServiceRequest | null
  fetchApplicants: () => Promise<void>
  fetchRequestDetails: () => Promise<void>
}

export function useApplicantReview({
  requestId,
  request,
  fetchApplicants,
  fetchRequestDetails,
}: UseApplicantReviewOptions) {
  const { token } = useAuth()
  const { toast } = useToast()
  const [updatingApplicantId, setUpdatingApplicantId] = useState<number | null>(null)
  const [decisionComments, setDecisionComments] = useState<Record<number, string>>({})
  const [applicantAllocations, setApplicantAllocations] = useState<Record<number, string>>({})
  const [applicantQuantities, setApplicantQuantities] = useState<Record<number, string>>({})
  const [receiptUploads, setReceiptUploads] = useState<Record<number, File | null>>({})
  const [ngoCompletionNotes, setNgoCompletionNotes] = useState<Record<number, string>>({})

  const handleApplicantDecision = async (applicant: ApplicantEntry, nextStatus: 'accepted' | 'rejected') => {
    if (!token) return

    const decisionComment = (decisionComments[applicant.id] || '').trim()
    let allocationAmount = applicantAllocations[applicant.id] || ''
    let allocationQuantity = applicantQuantities[applicant.id] || ''

    const isFinancial = request?.request_type?.toLowerCase()?.includes('financial') || false
    const targetAmount = Number(request?.target_amount || request?.estimated_budget || 0)
    const currentAmount = Number(request?.current_amount || 0)
    const remainingAmount = Math.max(0, targetAmount - currentAmount)
    const targetQty = Number(request?.target_quantity || request?.volunteers_needed || 0)
    const currentQty = Number(request?.current_quantity || 0)
    const remainingQty = Math.max(0, targetQty - currentQty)

    if (nextStatus === 'accepted') {
      if (isFinancial) {
        if (!allocationAmount || Number(allocationAmount) <= 0) {
          toast({ title: 'Allocation required', description: 'Enter amount to assign to this applicant', variant: 'destructive' })
          return
        }
        if (Number(allocationAmount) > remainingAmount) {
          allocationAmount = String(remainingAmount)
          toast({ title: 'Allocation adjusted', description: `Allocation reduced to remaining amount INR ${remainingAmount}`, variant: 'default' })
        }
      } else {
        if (!allocationQuantity || Number(allocationQuantity) <= 0) {
          toast({ title: 'Allocation required', description: 'Enter quantity to assign to this applicant', variant: 'destructive' })
          return
        }
        if (Number(allocationQuantity) > remainingQty) {
          allocationQuantity = String(remainingQty)
          toast({ title: 'Allocation adjusted', description: `Allocation reduced to remaining quantity ${remainingQty}`, variant: 'default' })
        }
      }
    }

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
          allocationAmount: isFinancial ? allocationAmount : undefined,
          allocationQuantity: !isFinancial ? allocationQuantity : undefined
        })
      })

      const data = await response.json()
      if (!response.ok || !data.success) {
        toast({ title: 'Update failed', description: data.error || 'Could not update applicant status', variant: 'destructive' })
        return
      }

      fetchApplicants()
      fetchRequestDetails()

      toast({ title: nextStatus === 'accepted' ? 'Applicant accepted' : 'Applicant rejected', description: nextStatus === 'accepted' ? 'Applicant has been accepted.' : 'Applicant has been rejected.' })
    } catch (error) {
      console.error('Error updating applicant decision:', error)
      toast({ title: 'Update failed', description: 'Could not update applicant status', variant: 'destructive' })
    } finally {
      setUpdatingApplicantId(null)
    }
  }

  const handleNgoConfirm = async (applicant: ApplicantEntry) => {
    if (!token) return

    try {
      let receiptUrl: string | undefined
      const receiptFile = receiptUploads[applicant.id]
      if (receiptFile) {
        receiptUrl = await uploadReceiptFile(receiptFile, token)
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
          completionNote: ngoCompletionNotes[applicant.id] || '',
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
    } catch (error) {
      toast({ title: 'Update failed', description: getErrorMessage(error) || 'Could not confirm fulfillment', variant: 'destructive' })
    }
  }

  return {
    updatingApplicantId,
    decisionComments,
    setDecisionComments,
    applicantAllocations,
    setApplicantAllocations,
    applicantQuantities,
    setApplicantQuantities,
    setReceiptUploads,
    ngoCompletionNotes,
    setNgoCompletionNotes,
    handleApplicantDecision,
    handleNgoConfirm,
  }
}

export type ApplicantReview = ReturnType<typeof useApplicantReview>
