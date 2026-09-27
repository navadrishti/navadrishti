import Link from "next/link"
import { ArrowRight, CheckCircle2, Pencil, Trash2, MoreVertical } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardTitle } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { VerifiedAccountName } from "@/components/verification-badge"
import { getGramAvatarFallbackStyle } from "@/lib/gram-avatar"
import { formatDisplayDate, formatStatusLabel } from "@/lib/format-date"
import type { getVolunteerButtonState } from "@/lib/campaign-schema"
import { formatBudgetLabel, formatVolunteersLabel, getStatusColor } from "./helpers"
import type { Campaign } from "./types"

type DetailFieldItem = {
  label: string
  value: string
  wide: boolean
  verified?: boolean
}

type CampaignCardProps = {
  campaign: Campaign
  isOwner: boolean
  isDeleting: boolean
  volunteerState: ReturnType<typeof getVolunteerButtonState> | null
  onVolunteer: (campaignId: string) => void
  onDelete: (campaignId: string) => void
}

function buildDetailFields(campaign: Campaign): DetailFieldItem[] {
  return [
    { label: 'Location', value: campaign.location || 'Not set', wide: true },
    { label: 'Duration', value: campaign.duration || 'Not set', wide: false },
    { label: 'Starts', value: formatDisplayDate(campaign.start_date) || 'Not set', wide: false },
    { label: 'Ends', value: formatDisplayDate(campaign.end_date) || 'Not set', wide: false },
    { label: 'Budget', value: formatBudgetLabel(campaign), wide: false },
    { label: 'Volunteers', value: formatVolunteersLabel(campaign), wide: false },
    ...(campaign.leadNgo
      ? [{
          label: 'Lead NGO',
          value: campaign.leadNgo,
          verified: Boolean(campaign.leadNgoVerified),
          wide: true,
        }]
      : []),
  ]
}

export function CampaignCard({ campaign, isOwner, isDeleting, volunteerState, onVolunteer, onDelete }: CampaignCardProps) {
  return (
    <Card className="h-full w-full max-w-[360px] overflow-hidden rounded-md border border-gram-border bg-white shadow-none">
      <CardContent className="flex h-full flex-col gap-2 px-3 pb-3 pt-2.5">
        <div className="flex min-w-0 items-baseline justify-between gap-2">
          <span
            className={`shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] ${getStatusColor(campaign.status)}`}
            title={formatStatusLabel(campaign.status)}
          >
            {formatStatusLabel(campaign.status)}
          </span>
          <span className="min-w-0 truncate text-xs text-gram-muted" title={campaign.category}>
            {campaign.category}
          </span>
        </div>

        <div className="min-w-0 space-y-1">
          <Link href={`/csr-campaigns/${campaign.id}`} className="block min-w-0">
            <CardTitle
              className="cursor-pointer truncate text-[17px] font-semibold leading-snug text-gram-ink"
              title={campaign.title}
            >
              {campaign.title}
            </CardTitle>
          </Link>
          <p className="min-w-0 truncate text-[13px] leading-5 text-gram-muted" title={campaign.description}>
            {campaign.description}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-gram-border pt-2">
          {buildDetailFields(campaign).map((field) => (
            <div
              key={field.label}
              className={`min-w-0 space-y-0.5 ${field.wide ? 'col-span-2' : ''}`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-gram-muted">
                {field.label}
              </p>
              {field.verified != null ? (
                <VerifiedAccountName
                  name={field.value}
                  verified={Boolean(field.verified)}
                  size="xs"
                  nameClassName="truncate text-[13px] font-medium text-gram-ink"
                  className="max-w-full"
                />
              ) : (
                <p className="truncate text-[13px] font-medium text-gram-ink" title={field.value}>
                  {field.value}
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="mt-auto flex min-w-0 items-center gap-2 border-t border-gram-border pt-2">
          <Link
            href={campaign.companyId ? `/profile/${campaign.companyId}` : '#'}
            className="flex min-w-0 flex-1 items-center gap-2"
          >
            <div
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-medium"
              style={getGramAvatarFallbackStyle(campaign.company || 'Company')}
            >
              {campaign.companyInitials || 'CO'}
            </div>
            <div className="min-w-0 flex-1">
              <VerifiedAccountName
                name={campaign.company}
                verified={Boolean(campaign.companyVerified)}
                size="sm"
                nameClassName="text-sm font-medium text-gram-ink"
              />
              <p className="truncate text-xs text-gram-muted">Company</p>
            </div>
          </Link>

          <Link
            href={`/csr-campaigns/${campaign.id}`}
            className="inline-flex shrink-0 items-center rounded-md border border-udaan-blue bg-udaan-blue px-2.5 py-1 text-sm font-medium text-white hover:bg-udaan-blue hover:text-white"
          >
            View campaign
          </Link>

          {isOwner ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-gram-muted hover:bg-transparent hover:text-gram-muted active:bg-transparent focus-visible:bg-transparent focus-visible:ring-0"
                  aria-label="Campaign actions"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={`/companies/csr-agent?campaign_id=${campaign.id}`} className="cursor-pointer">
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={isDeleting}
                  className="text-red-700 focus:text-red-700"
                  onSelect={(e) => {
                    e.preventDefault()
                    if (!isDeleting) onDelete(campaign.id)
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>

        {volunteerState ? (
          <div className="flex justify-end">
            {volunteerState.label === 'Applied' ? (
              <Button
                disabled
                variant="ghost"
                className="h-6 p-0 text-xs font-medium text-[#4F6B5C] shadow-none hover:bg-transparent hover:text-[#4F6B5C]"
              >
                <CheckCircle2 size={14} className="mr-1" />
                Applied
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                onClick={() => onVolunteer(campaign.id)}
                disabled={!volunteerState.canApply}
                className="h-6 p-0 text-xs font-medium text-gram-ink shadow-none hover:bg-transparent hover:text-gram-ink"
              >
                <ArrowRight size={14} className="mr-1" />
                {volunteerState.label}
              </Button>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
