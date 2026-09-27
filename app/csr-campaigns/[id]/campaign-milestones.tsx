import { DetailField } from "@/components/detail-fields"
import { formatCurrency, readMilestone } from "./helpers"

type CampaignMilestonesProps = {
  campaignId?: string
  milestones: Array<Record<string, unknown>>
}

export function CampaignMilestones({ campaignId, milestones }: CampaignMilestonesProps) {
  return (
    <section className="space-y-4">
      <h3 className="text-sm font-medium text-gray-500">Milestones</h3>
      {milestones.length > 0 ? (
        <div className="space-y-4">
          {milestones.map((raw, index) => {
            const milestone = readMilestone(raw, index)

            return (
              <div key={`${campaignId || 'campaign'}-milestone-${index}`} className="rounded-lg border border-slate-200 p-4 space-y-3">
                <div>
                  <p className="text-sm text-gray-500">Title</p>
                  <p className="text-sm font-medium text-slate-800">{milestone.title}</p>
                </div>
                {milestone.description ? (
                  <div>
                    <p className="text-sm text-gray-500">Description</p>
                    <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{milestone.description}</p>
                  </div>
                ) : null}
                <div className="grid grid-cols-1 gap-x-12 gap-y-4 md:grid-cols-2">
                  <DetailField label="Start Date" value={milestone.startDate || 'Not set'} />
                  <DetailField label="End Date" value={milestone.endDate || 'Not set'} />
                  <DetailField label="Budget Target" value={milestone.budgetTarget > 0 ? formatCurrency(milestone.budgetTarget) : 'Not set'} />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Deliverables</p>
                  {milestone.deliverables.length > 0 ? (
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-800">
                      {milestone.deliverables.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-sm font-medium text-slate-800">Not set</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-sm font-medium text-slate-800">Not set</p>
      )}
    </section>
  )
}
