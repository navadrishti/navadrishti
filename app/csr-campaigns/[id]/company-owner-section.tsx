import { DetailField, DetailSection } from "@/components/detail-fields"
import { formatDisplayDate } from "@/lib/format-date"
import type { Campaign } from "./types"

export function CompanyOwnerSection({ campaign }: { campaign: Campaign }) {
  const ownerName = campaign.company_id ? `Company #${campaign.company_id}` : 'Company not set'

  return (
    <DetailSection title="Company Owner">
      <DetailField label="Owner Name" value={ownerName} />
      <DetailField label="Owner Type" value="Company" />
      <DetailField label="Company ID" value={campaign.company_id || 'Not set'} />
      <DetailField label="Campaign Status" value={campaign.status || 'draft'} />
      <DetailField
        label="Campaign Timeline"
        value={`${formatDisplayDate(campaign.start_date) || 'Not set'} to ${formatDisplayDate(campaign.end_date) || 'Not set'}`}
      />
    </DetailSection>
  )
}
