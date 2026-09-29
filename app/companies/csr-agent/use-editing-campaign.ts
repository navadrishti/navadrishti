import { useEffect, useState } from "react"
import { campaignRowToDraft, fetchCampaignRow } from "./api"
import type { ConversationStage, GeneratedCampaign, ProjectIntakeData } from "./session"

type EditingCampaignOptions = {
  mounted: boolean
  token: string | null
  editingCampaignId: string | null
  setProjectData: (projectData: ProjectIntakeData) => void
  setGeneratedCampaigns: (campaigns: GeneratedCampaign[]) => void
  setPublishedCampaignId: (campaignId: string) => void
  setConversationStage: (stage: ConversationStage) => void
}

export function useEditingCampaign({
  mounted,
  token,
  editingCampaignId,
  setProjectData,
  setGeneratedCampaigns,
  setPublishedCampaignId,
  setConversationStage,
}: EditingCampaignOptions) {
  const [editingCampaignHasLead, setEditingCampaignHasLead] = useState(false)

  useEffect(() => {
    if (!mounted || !editingCampaignId) return

    const hydrateCampaign = async () => {
      try {
        const campaign = await fetchCampaignRow(editingCampaignId, token)
        if (!campaign) return

        const draft = campaignRowToDraft(campaign)
        setProjectData({
          campaignName: draft.title,
          category: draft.category,
          city: draft.location,
          state: '',
          budget: `INR ${draft.budget_inr}`,
          volunteerRequirement: String(campaign.impact_metrics?.volunteer_requirement || ''),
          startDate: draft.start_date,
          endDate: draft.end_date,
          requirementDetails: draft.description
        })
        setGeneratedCampaigns([draft])
        setPublishedCampaignId(String(campaign.id))
        setEditingCampaignHasLead(Number(campaign.lead_ngo_user_id || 0) > 0)
        setConversationStage('complete')
      } catch (error) {
        console.error('Failed to hydrate campaign for editing:', error)
      }
    }

    void hydrateCampaign()
  }, [mounted, token, editingCampaignId, setProjectData, setGeneratedCampaigns, setPublishedCampaignId, setConversationStage])

  return { editingCampaignHasLead }
}
