'use client'

import { useEffect, useEffectEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/hooks/use-toast'
import type { ServiceRequest, VolunteerApplication } from './types'

export function useServiceRequestData(requestId: string) {
  const router = useRouter()
  const { user, token } = useAuth()
  const { toast } = useToast()
  const [request, setRequest] = useState<ServiceRequest | null>(null)
  const [userApplication, setUserApplication] = useState<VolunteerApplication | null>(null)
  const [loading, setLoading] = useState(true)

  const isAuthenticated = !!(user && token)

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
      if (!token || !user) return

      const response = await fetch(`/api/service-requests/${requestId}/volunteers?userId=${user.id}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })
      if (response.ok) {
        const data = await response.json()
        const applications: VolunteerApplication[] = data.success ? data.data : data
        const existingApplication = applications.find((app) => Number(app.applicant_user_id) === Number(user.id))
        setUserApplication(existingApplication || null)
      }
    } catch (error) {
      console.error('Error checking application:', error)
    }
  }

  const loadForViewer = useEffectEvent(() => {
    fetchRequestDetails()
    if (isAuthenticated && user?.user_type === 'individual') {
      checkExistingApplication()
    }
  })

  useEffect(() => {
    if (requestId) loadForViewer()
  }, [requestId, isAuthenticated, user])

  return {
    request,
    loading,
    userApplication,
    setUserApplication,
    fetchRequestDetails,
    checkExistingApplication,
  }
}
