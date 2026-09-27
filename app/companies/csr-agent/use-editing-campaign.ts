import { useEffect } from "react"
import { campaignRowToDraft, fetchCampaignRow } from "./api"
import type { ConversationStage, GeneratedCampaign, ProjectIntakeData } from "./session"

type EditingCampaignOptions = {
  mounted: boolean
  editingCampaignId: string | null
  setProjectData: (projectData: ProjectIntakeData) => void
  setGeneratedCampaigns: (campaigns: GeneratedCampaign[]) => void
  setPublishedCampaignId: (campaignId: string) => void
  setConversationStage: (stage: ConversationStage) => void
}

export function useEditingCampaign({
  mounted,
  editingCampaignId,
  setProjectData,
  setGeneratedCampaigns,
  setPublishedCampaignId,
  setConversationStage,
}: EditingCampaignOptions) {
  useEffect(() => {
    if (!mounted || !editingCampaignId) return

    const hydrateCampaign = async () => {
      try {
        const campaign = await fetchCampaignRow(editingCampaignId)
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
        setConversationStage('complete')
      } catch (error) {
        console.error('Failed to hydrate campaign for editing:', error)
      }
    }

    void hydrateCampaign()
  }, [mounted, editingCampaignId])
}
