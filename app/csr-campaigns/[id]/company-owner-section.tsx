import { DetailField, DetailSection } from "@/components/detail-fields"
import { VerifiedAccountName } from "@/components/verification-badge"
import { formatDisplayDate, formatStatusLabel } from "@/lib/format-date"
import type { Campaign } from "./types"

export function CompanyOwnerSection({ campaign }: { campaign: Campaign }) {
  const startDate = formatDisplayDate(campaign.start_date)
  const endDate = formatDisplayDate(campaign.end_date)

  return (
    <DetailSection title="Company Owner">
      <DetailField
        label="Company"
        value={
          campaign.company_name ? (
            <VerifiedAccountName
              name={campaign.company_name}
              status={campaign.company_verification_status}
              verified={campaign.company_verified}
              size="sm"
            />
          ) : (
            'Not set'
          )
        }
      />
      <DetailField label="Campaign Status" value={formatStatusLabel(campaign.status || 'draft')} />
      <DetailField
        label="Campaign Timeline"
        value={startDate || endDate ? `${startDate || 'Not set'} to ${endDate || 'Not set'}` : 'Not set'}
      />
    </DetailSection>
  )
}
