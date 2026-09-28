import { useEffect, useEffectEvent, useState } from "react"
import { toCampaign } from "./helpers"
import type { Campaign, CampaignApiItem } from "./types"

const readToken = () => (typeof window !== 'undefined' ? localStorage.getItem('token') : null)

export function useCampaigns(currentUserId: number, userType?: string) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingCampaignId, setDeletingCampaignId] = useState<string | null>(null)
  const [applyingCampaignId, setApplyingCampaignId] = useState<string | null>(null)

  const loadCampaigns = async () => {
    setLoading(true)

    try {
      const token = readToken()
      const response = await fetch('/api/campaigns', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
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
    const token = readToken()
    if (!token) return

    try {
      setApplyingCampaignId(campaignId)
      const response = await fetch(`/api/campaigns/${campaignId}/volunteer`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Failed to volunteer')
      }
      await loadCampaigns()
    } catch (error) {
      console.error('Failed to volunteer for campaign:', error)
    } finally {
      setApplyingCampaignId(null)
    }
  }

  const deleteCampaign = async (campaignId: string) => {
    const token = readToken()
    if (!token) return
    if (!confirm('Delete this CSR campaign?')) return

    try {
      setDeletingCampaignId(campaignId)
      const response = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Failed to delete campaign')
      }
      await loadCampaigns()
    } catch (error) {
      console.error('Failed to delete campaign:', error)
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
