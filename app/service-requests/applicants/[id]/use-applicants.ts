import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/hooks/use-toast'
import { getNeedRemainingQuantity, getServiceRequestTarget } from '@/lib/service-request-allocation'
import { normalizeVolunteer } from './helpers'
import type { ServiceRequest, Volunteer } from './types'

function describeStatusChange(newStatus: string) {
  if (newStatus === 'accepted') return 'accepted'
  if (newStatus === 'rejected') return 'rejected'
  if (newStatus === 'completed') return 'marked as completed'
  if (newStatus === 'active') return 'activated'
  return 'updated'
}

/** Loads a need and its applicants for the owning NGO and handles applicant status changes. */
export function useApplicants(requestId: string) {
  const router = useRouter()
  const { user } = useAuth()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [request, setRequest] = useState<ServiceRequest | null>(null)
  const [volunteers, setVolunteers] = useState<Volunteer[]>([])
  const [updating, setUpdating] = useState<number | null>(null)

  useEffect(() => {
    if (!user) {
      router.push('/login')
      return
    }
    if (user.user_type !== 'ngo') {
      toast({
        title: "Access Denied",
        description: "Only NGOs can view applicants",
        variant: "destructive",
      })
      router.push('/service-requests')
      return
    }
  }, [user, router, toast])

  useEffect(() => {
    if (!user || user.user_type !== 'ngo' || !requestId) return

    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token')

        const requestResponse = await fetch(`/api/service-requests/${requestId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        })
        const requestData = await requestResponse.json()

        if (requestData.success) {
          setRequest(requestData.data)
        } else {
          toast({
            title: "Error",
            description: requestData.error || "Failed to fetch need details",
            variant: "destructive",
          })
          router.push('/service-requests')
          return
        }

        const volunteersResponse = await fetch(`/api/service-requests/${requestId}/volunteers`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        })
        const volunteersData = await volunteersResponse.json()

        if (volunteersData.success) {
          setVolunteers((volunteersData.data || []).map(normalizeVolunteer))
        } else {
          console.error('Failed to fetch volunteers:', volunteersData.error)
        }
      } catch (error) {
        console.error('Error fetching data:', error)
        toast({
          title: "Error",
          description: "Failed to fetch data",
          variant: "destructive",
        })
        router.push('/service-requests')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [user, requestId, router, toast])

  const handleVolunteerStatusUpdate = async (volunteer: Volunteer, newStatus: string) => {
    setUpdating(volunteer.id)
    try {
      const token = localStorage.getItem('token')
      const payload: Record<string, unknown> = { status: newStatus }

      // Accepting allocates the applicant's offer, capped at what the need still requires.
      if (newStatus === 'accepted') {
        const target = getServiceRequestTarget(request)
        const remaining = getNeedRemainingQuantity(request)
        if (target.isFinancial) {
          const offer = Number(volunteer.fulfillment_amount ?? volunteer.assigned_amount ?? 0)
          payload.allocationAmount = Math.min(offer > 0 ? offer : remaining, remaining)
        } else {
          const offer = Number(volunteer.fulfillment_quantity ?? volunteer.assigned_quantity ?? 0)
          payload.allocationQuantity = Math.min(offer > 0 ? offer : remaining, remaining)
        }
      }

      const response = await fetch(`/api/service-requests/${requestId}/volunteers/${volunteer.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (data.success) {
        const [requestResponse, volunteersResponse] = await Promise.all([
          fetch(`/api/service-requests/${requestId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`/api/service-requests/${requestId}/volunteers`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ])

        const requestData = await requestResponse.json()
        const volunteersData = await volunteersResponse.json()

        if (requestData.success) {
          setRequest(requestData.data)
        }
        if (volunteersData.success) {
          setVolunteers((volunteersData.data || []).map(normalizeVolunteer))
        }

        toast({
          title: "Success",
          description: `Volunteer ${describeStatusChange(newStatus)} successfully`,
        })
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to update volunteer status",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error('Error updating volunteer status:', error)
      toast({
        title: "Error",
        description: "Failed to update volunteer status",
        variant: "destructive",
      })
    } finally {
      setUpdating(null)
    }
  }

  return { router, loading, request, volunteers, updating, handleVolunteerStatusUpdate }
}
