import { useEffect, useState } from "react"
import { useAuth } from '@/lib/auth-context'
import { isCampaignStarted, isVolunteerRegistrationPastDeadline } from "@/lib/format-date"
import { getVolunteerButtonState, sumVolunteerApplicationCount } from "@/lib/campaign-schema"
import { isCampaignLeadNgo } from '@/lib/campaign-volunteer-attendance'
import type { Campaign } from "./types"

export function useCampaignDetail(campaignId: string) {
  const { user, token } = useAuth()
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [accepting, setAccepting] = useState(false)
  const [applying, setApplying] = useState(false)

  const currentUserId = Number(user?.id || 0)
  const allVerified = Boolean(user?.email_verified && user?.phone_verified && user?.verification_status === 'verified')

  const loadCampaign = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success || !payload?.data) {
        setCampaign(null)
        setError(payload?.error || 'Campaign not found')
        return
      }
      setCampaign(payload.data as Campaign)
    } catch {
      setError('Failed to load campaign details')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!campaignId) return
    void loadCampaign()
  }, [campaignId, currentUserId])

  const impact = campaign?.impact_metrics
  const applications = Array.isArray(impact?.volunteer_applications) ? impact.volunteer_applications : []
  const appliedByCurrentUser = currentUserId > 0
    ? applications.some((application) => Number(application?.user_id || 0) === currentUserId)
    : false

  const volunteerState = getVolunteerButtonState({
    status: campaign?.status,
    startDate: campaign?.start_date,
    leadNgoAccepted: impact?.lead_ngo_accepted,
    volunteerCount: sumVolunteerApplicationCount(applications),
    volunteerLimit: Number(impact?.volunteer_requirement ?? impact?.volunteer_limit ?? 0) || 0,
    userType: user?.user_type,
    allVerified,
    applied: appliedByCurrentUser,
    applying,
    isVolunteerRegistrationPastDeadline,
    isCampaignStarted,
  })

  const isLeadNgoForCampaign = Boolean(
    campaign && currentUserId > 0 && isCampaignLeadNgo(campaign, currentUserId)
  )
  const canShowVolunteerAction = (user?.user_type === 'ngo' || user?.user_type === 'individual') && !isLeadNgoForCampaign
  const hasPendingLeadInvite = Boolean(
    campaign &&
    currentUserId > 0 &&
    Number(campaign.lead_ngo_user_id || 0) === currentUserId &&
    campaign.status !== 'active'
  )

  const volunteer = async () => {
    if (!token) {
      alert('Please sign in to volunteer')
      return
    }
    if (applying) return
    try {
      setApplying(true)
      const res = await fetch(`/api/campaigns/${campaignId}/volunteer`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok || !payload?.success) {
        alert(payload?.error || 'Failed to volunteer')
      } else {
        await loadCampaign()
        alert('Applied to volunteer')
      }
    } catch (e) {
      console.error(e)
      alert('Failed to volunteer')
    } finally {
      setApplying(false)
    }
  }

  const acceptLeadRole = async () => {
    if (!campaignId) return
    try {
      setAccepting(true)
      const res = await fetch('/api/campaigns/accept-lead', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ campaign_id: campaignId })
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok || !payload?.success) {
        alert(payload?.error || 'Failed to accept lead role')
      } else {
        setCampaign((prev) => (prev ? { ...prev, ...payload.data } : payload.data))
        alert('Accepted lead role. Volunteer gap calculated and campaign activated.')
      }
    } catch {
      alert('Failed to accept lead role')
    } finally {
      setAccepting(false)
    }
  }

  return {
    user,
    campaign,
    loading,
    error,
    accepting,
    volunteerState,
    canShowVolunteerAction,
    hasPendingLeadInvite,
    volunteer,
    acceptLeadRole,
  }
}
