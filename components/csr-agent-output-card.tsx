import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type ProjectStatus = "pending" | "accepted" | "rejected"

interface GeneratedCampaign {
  title: string
  description: string
  category: string
  location: string
  budget_inr: number
  budget_breakdown: {
    infrastructure: number
    training: number
    materials: number
    monitoring: number
    contingency: number
  }
  schedule_vii: string
  sdg_alignment: number[]
  start_date: string
  end_date: string
  impact_metrics: {
    beneficiaries: number
    duration: string
  }
  milestones: Array<{
    title: string
    description: string
    duration_weeks: number
    budget_allocated: number
    deliverables: string[]
  }>
}

interface CSRAgentOutputCardProps {
  campaign: GeneratedCampaign
  status: ProjectStatus
  isSaving: boolean
  onAccept: () => void
  onReject: () => void
}

const CURRENCY_FORMATTER = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
})

function formatCurrency(amount: number): string {
  return CURRENCY_FORMATTER.format(Math.round(amount))
}

export function CSRAgentOutputCard({
  campaign,
  status,
  isSaving,
  onAccept,
  onReject,
}: CSRAgentOutputCardProps) {
  return (
    <Card className="border-gray-200">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg text-udaan-navy">{campaign.title}</CardTitle>
            <CardDescription className="mt-1">{campaign.start_date} to {campaign.end_date}</CardDescription>
          </div>
          <Badge
            variant={status === "accepted" ? "default" : "secondary"}
            className={status === "rejected" ? "bg-red-100 text-red-700 hover:bg-red-100" : ""}
          >
            {status === "pending" && "Pending Decision"}
            {status === "accepted" && "Accepted"}
            {status === "rejected" && "Rejected"}
          </Badge>
        </div>

        <p className="text-sm text-gray-700">{campaign.description}</p>

        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{campaign.category}</Badge>
          <Badge variant="outline">{campaign.location}</Badge>
          <Badge variant="outline">Schedule VII: {campaign.schedule_vii}</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Budget</p>
            <p className="text-sm font-semibold text-udaan-orange">{formatCurrency(campaign.budget_inr)}</p>
          </div>
          <div className="rounded-md bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Beneficiaries</p>
            <p className="text-sm font-semibold text-udaan-navy">{campaign.impact_metrics.beneficiaries.toLocaleString("en-IN")}</p>
          </div>
          <div className="rounded-md bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Duration</p>
            <p className="text-sm font-semibold text-udaan-navy">{campaign.impact_metrics.duration}</p>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-udaan-navy">Budget Breakdown</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <p className="rounded border p-2 text-xs text-gray-700">Infrastructure: {formatCurrency(campaign.budget_breakdown.infrastructure)}</p>
            <p className="rounded border p-2 text-xs text-gray-700">Training: {formatCurrency(campaign.budget_breakdown.training)}</p>
            <p className="rounded border p-2 text-xs text-gray-700">Materials: {formatCurrency(campaign.budget_breakdown.materials)}</p>
            <p className="rounded border p-2 text-xs text-gray-700">Monitoring: {formatCurrency(campaign.budget_breakdown.monitoring)}</p>
            <p className="rounded border p-2 text-xs text-gray-700">Contingency: {formatCurrency(campaign.budget_breakdown.contingency)}</p>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-udaan-navy">SDG Alignment</h3>
          <div className="flex flex-wrap gap-2">
            {campaign.sdg_alignment.map((sdg) => (
              <Badge key={`${campaign.title}-sdg-${sdg}`} variant="outline">
                SDG {sdg}
              </Badge>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-udaan-navy">Milestones</h3>
          {campaign.milestones.map((milestone, index) => (
            <div key={`${campaign.title}-milestone-${index}`} className="rounded-lg border border-gray-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-udaan-navy">{index + 1}. {milestone.title}</p>
                <p className="text-xs text-gray-600">
                  {milestone.duration_weeks} weeks • {formatCurrency(milestone.budget_allocated)}
                </p>
              </div>
              <p className="mt-2 text-sm text-gray-700">{milestone.description}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-gray-600">
                {milestone.deliverables.map((deliverable, deliverableIndex) => (
                  <li key={`${campaign.title}-milestone-${index}-deliverable-${deliverableIndex}`}>{deliverable}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 pt-1 sm:flex-row">
          <Button
            type="button"
            className="bg-green-600 hover:bg-green-700 sm:min-w-32"
            disabled={isSaving || status === "accepted"}
            onClick={onAccept}
          >
            {isSaving ? "Saving..." : "Accept"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="border-red-300 text-red-600 hover:bg-red-50 sm:min-w-32"
            disabled={isSaving}
            onClick={onReject}
          >
            {isSaving ? "Saving..." : "Reject"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
