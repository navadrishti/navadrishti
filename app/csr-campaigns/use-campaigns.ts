import { readApiError } from '@/lib/user-facing-error'
import { useEffect, useEffectEvent, useState } from "react"
import { toast } from "sonner"
import { clientAuthHeaders } from "@/lib/client-session"
import { getErrorMessage } from "@/lib/utils"
import { toCampaign } from "./helpers"
import type { Campaign, CampaignApiItem } from "./types"

export function useCampaigns(currentUserId: number, userType?: string) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingCampaignId, setDeletingCampaignId] = useState<string | null>(null)
  const [applyingCampaignId, setApplyingCampaignId] = useState<string | null>(null)

  const loadCampaigns = async () => {
    setLoading(true)

    try {
      const response = await fetch('/api/campaigns', {
        credentials: 'include',
        headers: clientAuthHeaders(),
      })
      const payload = await response.json()

      if (!response.ok || !payload?.success) {
        setCampaigns([])
        return
      }

      const rows = Array.isArray(payload.data) ? (payload.data as CampaignApiItem[]) : []
      setCampaigns(rows.map((row) => toCampaign(row, currentUserId)))
    } catch (error) {
      console.error('Failed to load campaigns:', error)
      setCampaigns([])
    } finally {
      setLoading(false)
    }
  }

  const loadCampaignsForViewer = useEffectEvent(loadCampaigns)

  useEffect(() => {
    void loadCampaignsForViewer()
  }, [currentUserId, userType])

  const volunteerForCampaign = async (campaignId: string) => {
    try {
      setApplyingCampaignId(campaignId)
      const response = await fetch(`/api/campaigns/${campaignId}/volunteer`, {
        method: 'POST',
        credentials: 'include',
        headers: clientAuthHeaders(),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) {
        throw new Error(readApiError(payload, 'Failed to volunteer'))
      }
      await loadCampaigns()
    } catch (error) {
      console.error('Failed to volunteer for campaign:', error)
      toast.error(getErrorMessage(error) || 'Failed to volunteer')
    } finally {
      setApplyingCampaignId(null)
    }
  }

  const deleteCampaign = async (campaignId: string) => {
    if (!confirm('Delete this CSR campaign?')) return

    try {
      setDeletingCampaignId(campaignId)
      const response = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: clientAuthHeaders(),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) {
        throw new Error(readApiError(payload, 'Failed to delete campaign'))
      }
      await loadCampaigns()
    } catch (error) {
      console.error('Failed to delete campaign:', error)
      toast.error(getErrorMessage(error) || 'Failed to delete campaign')
    } finally {
      setDeletingCampaignId(null)
    }
  }

  return {
    campaigns,
    loading,
    deletingCampaignId,
    applyingCampaignId,
    volunteerForCampaign,
    deleteCampaign,
  }
}
