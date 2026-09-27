'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/hooks/use-toast'
import type { ApplicantEntry, ServiceRequest, VolunteerApplication } from './types'

export function useServiceRequestData(requestId: string) {
  const router = useRouter()
  const { user, token } = useAuth()
  const { toast } = useToast()
  const [request, setRequest] = useState<ServiceRequest | null>(null)
  const [userApplication, setUserApplication] = useState<VolunteerApplication | null>(null)
  const [applicants, setApplicants] = useState<ApplicantEntry[]>([])
  const [loading, setLoading] = useState(true)

  const isAuthenticated = !!(user && token)

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

  const fetchRequestDetails = async () => {
    try {
      const response = await fetch(`/api/service-requests/${requestId}`)
      if (response.ok) {
        const data = await response.json()
        // Older API responses return the request itself instead of { success, data }.
        setRequest(data.success ? data.data : data)
      } else {
        toast({
          title: 'Error',
          description: 'Failed to load need details',
          variant: 'destructive'
        })
        router.push('/service-requests')
      }
    } catch (error) {
      console.error('Error fetching request:', error)
      toast({
        title: 'Error',
        description: 'Failed to load need details',
        variant: 'destructive'
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
        const applications: VolunteerApplication[] = data.success ? data.data : data
        const existingApplication = applications.find((app) => Number(app.applicant_user_id) === Number(user?.id))
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

  return {
    request,
    loading,
    applicants,
    userApplication,
    setUserApplication,
    fetchRequestDetails,
    fetchApplicants,
    checkExistingApplication,
  }
}
