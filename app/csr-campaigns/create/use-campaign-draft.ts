import { readApiError } from '@/lib/user-facing-error'
import { useState } from 'react'
import { publishCampaignDraft } from '@/app/companies/csr-agent/api'
import { authHeaders, buildManualCampaignBody, isCampaignDraftUpdateSuccess, type ManualCampaignForm } from './helpers'

type UseCampaignDraftOptions = {
  form: ManualCampaignForm
  token: string | null
  userId: number | undefined
  selectedProjectId: string | null
  invitedOfferIds: number[]
  draftCampaignId: string | null
  setDraftCampaignId: (id: string) => void
}

export function useCampaignDraft({
  form,
  token,
  userId,
  selectedProjectId,
  invitedOfferIds,
  draftCampaignId,
  setDraftCampaignId,
}: UseCampaignDraftOptions) {
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)

  const campaignBody = () =>
    buildManualCampaignBody(form, {
      selectedProjectId,
    })

  const saveDraft = async () => {
    if (!token || !userId) throw new Error('Please sign in again.')
    setSaving(true)
    try {
      const body = campaignBody()
      if (draftCampaignId) {
        const response = await fetch('/api/csr-agent/update-campaign', {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({
            company_id: userId,
            campaign_id: draftCampaignId,
            campaign: {
              title: body.title,
              description: body.description,
              category: body.category,
              location: body.location,
              budget_inr: body.budget_inr,
              schedule_vii: body.schedule_vii,
              start_date: body.start_date,
              end_date: body.end_date,
              impact_metrics: {
                ...body.impact_metrics,
                beneficiaries: Number(form.beneficiaries || 0),
                duration: String(body.impact_metrics.duration || ''),
              },
              milestones: body.milestones,
            },
          }),
        })
        const payload = await response.json().catch(() => null)
        if (!response.ok || !isCampaignDraftUpdateSuccess(payload)) {
          throw new Error(readApiError(payload, 'Failed to update campaign draft'))
        }
        return String(payload?.data?.id || payload?.id || draftCampaignId)
      }

      const response = await fetch('/api/campaigns', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify(body),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.success || !payload?.data?.id) {
        throw new Error(readApiError(payload, 'Failed to save campaign draft'))
      }
      const savedId = String(payload.data.id)
      setDraftCampaignId(savedId)
      return savedId
    } finally {
      setSaving(false)
    }
  }

  const publishDraft = async (campaignId: string) => {
    if (!token) throw new Error('Please sign in again.')
    setPublishing(true)
    try {
      const body = campaignBody()
      const published = await publishCampaignDraft(token, campaignId, {
        ...body,
        budget_breakdown: body.budget_breakdown,
        impact_metrics: {
          beneficiaries: Number(form.beneficiaries || 0),
          duration: String(body.impact_metrics.duration || ''),
          volunteer_requirement: form.volunteerRequirement,
          selected_existing_project_id: selectedProjectId,
          invited_offer_ids: invitedOfferIds,
          csr_agent_session_id: '',
          lead_ngo_accepted: false,
          lead_ngo_invites: [],
        },
      })
      return String(published.id || campaignId)
    } finally {
      setPublishing(false)
    }
  }

  return {
    saving,
    publishing,
    saveDraft,
    publishDraft,
  }
}
