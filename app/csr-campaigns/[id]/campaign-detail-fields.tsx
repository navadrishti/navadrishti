import { DetailField, DetailSection, displayValue } from "@/components/detail-fields"
import { formatDetailDate, formatDisplayDate } from "@/lib/format-date"
import { readCampaignCategory, readCampaignDuration, readCampaignLocation } from "@/lib/campaign-schema"
import { Badge } from "@/components/ui/badge"
import { VerifiedAccountName } from '@/components/verification-badge'
import { parseJsonObject } from '@/lib/utils'
import { formatCurrency, labelForBudgetKey, parseCityState } from "./helpers"
import { CampaignMilestones } from "./campaign-milestones"
import type { CampaignRecord } from "./types"

export function CampaignDetailFields({ campaign }: { campaign: CampaignRecord }) {
  const impact = parseJsonObject(campaign.impact_metrics)
  const location = readCampaignLocation(campaign)
  const { city, state } = parseCityState(location, impact)
  const volunteerRequirement = String(impact.volunteer_requirement || impact.volunteerRequirement || '')
  const beneficiaries = impact.beneficiaries ?? impact.impact_reach
  const duration = readCampaignDuration(campaign)
  const selectedLeadNgoName = String(campaign.selected_lead_ngo_name || '')
  const selectedLeadNgoId = Number(campaign.lead_ngo_user_id || 0)
  const invitedOfferIds = Array.isArray(impact.invited_offer_ids) ? impact.invited_offer_ids : []
  const sdgAlignment = Array.isArray(campaign.sdg_alignment) ? campaign.sdg_alignment : []
  const budgetParts = Object.entries(campaign.budget_breakdown || {})
    .map(([label, value]) => ({ label, value: Number(value) || 0 }))
    .filter((entry) => entry.value > 0)
  const milestones = Array.isArray(campaign.milestones) ? campaign.milestones : []

  return (
    <div className="space-y-6">
      <section className="space-y-6">
        <h3 className="text-sm font-medium text-gray-500">Campaign Details</h3>

        <div>
          <p className="text-sm text-gray-500">Campaign Name</p>
          <p className="text-sm font-medium text-slate-800">{campaign.title || readCampaignCategory(campaign) || 'Not set'}</p>
        </div>

        <section className="space-y-3">
          <h4 className="text-sm font-medium text-gray-500">Description</h4>
          <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
            {displayValue(campaign.description)}
          </p>
        </section>

        <div className="grid grid-cols-1 gap-x-12 gap-y-6 md:grid-cols-2">
          <DetailField label="Category (Schedule VII)" value={displayValue(campaign.category || campaign.schedule_vii)} />
          <DetailField label="City" value={city} />
          <DetailField label="State / Province" value={state} />
          <DetailField label="Budget (INR)" value={formatCurrency(campaign.budget_inr)} />
          <DetailField label="Volunteer Requirement" value={displayValue(volunteerRequirement)} />
          <DetailField label="Start Date" value={formatDisplayDate(campaign.start_date) || formatDetailDate(campaign.start_date)} />
          <DetailField label="End Date" value={formatDisplayDate(campaign.end_date) || formatDetailDate(campaign.end_date)} />
        </div>
      </section>

      <DetailSection title="Impact & Alignment">
        <DetailField
          label="Expected Beneficiaries"
          value={
            beneficiaries != null && Number(beneficiaries) > 0
              ? Number(beneficiaries).toLocaleString('en-IN')
              : 'Not set'
          }
        />
        <DetailField label="Duration" value={displayValue(duration)} />
        <div className="md:col-span-2">
          <p className="text-sm text-gray-500">SDG Alignment</p>
          {sdgAlignment.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-2">
              {sdgAlignment.map((sdg) => (
                <Badge key={sdg} variant="secondary" className="border-gray-200 bg-gray-100 text-gray-700">
                  SDG {sdg}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-sm font-medium text-slate-800">Not set</p>
          )}
        </div>
      </DetailSection>

      <DetailSection title="Budget Breakdown">
        {budgetParts.length > 0 ? (
          budgetParts.map((part) => (
            <DetailField key={part.label} label={labelForBudgetKey(part.label)} value={formatCurrency(part.value)} />
          ))
        ) : (
          <div className="md:col-span-2">
            <p className="text-sm font-medium text-slate-800">Not set</p>
          </div>
        )}
      </DetailSection>

      <DetailSection title="Lead NGO & Offers">
        <DetailField
          label="Company"
          value={
            campaign.company_name ? (
              <VerifiedAccountName
                name={campaign.company_name}
                status={campaign.company_verification_status}
                verified={campaign.company_verified}
                size="xs"
                nameClassName="font-medium text-slate-800"
              />
            ) : (
              'Not set'
            )
          }
        />
        <DetailField
          label="Lead NGO"
          value={
            selectedLeadNgoName ? (
              <VerifiedAccountName
                name={selectedLeadNgoName}
                status={campaign.selected_lead_ngo_verification_status}
                verified={campaign.selected_lead_ngo_verified}
                size="xs"
                nameClassName="font-medium text-slate-800"
              />
            ) : selectedLeadNgoId > 0 ? (
              `NGO #${selectedLeadNgoId}`
            ) : (
              'Not selected'
            )
          }
        />
        <DetailField
          label="Invited Offers"
          value={invitedOfferIds.length > 0 ? `${invitedOfferIds.length} invited` : 'None yet'}
        />
      </DetailSection>

      <CampaignMilestones campaignId={campaign.id} milestones={milestones} />
    </div>
  )
}
