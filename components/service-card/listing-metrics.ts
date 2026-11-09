import { formatMeterInr, meterPercent } from '@/components/info-meter'
import { getServiceRequestTarget } from '@/lib/service-request-allocation'
import { parseAmountToInr } from '@/lib/utils'
import { formatPostedDate } from './helpers'
import type { ServiceCardProps } from './types'

/** Progress-only meter: requires a real part/whole relationship. */
export type ListingMeter = {
  title: string
  value: string
  detail?: string | null
  progress: number
}

export type ListingStat = {
  label: string
  value: string
  detail?: string | null
}

function finiteNumber(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export type NeedListingPresentation = {
  meters: ListingMeter[]
  stats: ListingStat[]
  /** Extra contextual fragments for the card meta line (not duplicated as meters). */
  contextBits: string[]
}

/** Build marketplace Need card presentation from existing listing fields only. */
export function getNeedListingPresentation(
  props: Pick<
    ServiceCardProps,
    | 'request_type'
    | 'category'
    | 'requirements'
    | 'target_amount'
    | 'current_amount'
    | 'remaining_amount'
    | 'target_quantity'
    | 'current_quantity'
    | 'remaining_quantity'
    | 'volunteers_needed'
    | 'accepted_volunteers_count'
    | 'volunteers_count'
    | 'estimated_budget'
    | 'status'
    | 'created_at'
    | 'updated_at'
    | 'deadline'
    | 'timeline'
  >
): NeedListingPresentation {
  const meters: ListingMeter[] = []
  const stats: ListingStat[] = []
  const contextBits: string[] = []
  const target = getServiceRequestTarget({
    request_type: props.request_type,
    category: props.category,
    requirements: props.requirements,
    target_amount: props.target_amount,
    target_quantity: props.target_quantity,
    volunteers_needed: props.volunteers_needed,
  })

  const status = String(props.status || '').trim()
  if (status) contextBits.push(status.replace(/_/g, ' '))
  const deadline = props.deadline || props.timeline
  if (deadline) contextBits.push(`Due ${deadline}`)
  const updated = props.updated_at || props.created_at
  if (updated) contextBits.push(`Updated ${formatPostedDate(String(updated))}`)

  if (target.isFinancial) {
    const raised = Math.max(0, parseAmountToInr(props.current_amount))
    const goal = Math.max(0, target.amount)
    const remaining =
      finiteNumber(props.remaining_amount) != null
        ? Math.max(0, Number(props.remaining_amount))
        : Math.max(0, goal - raised)
    if (goal > 0) {
      const progress = meterPercent(raised, goal)
      if (progress != null) {
        meters.push({
          title: 'Funding progress',
          value: `${formatMeterInr(raised)} of ${formatMeterInr(goal)}`,
          progress,
          detail: remaining > 0 ? `${formatMeterInr(remaining)} remaining` : null,
        })
      }
    } else if (props.estimated_budget) {
      stats.push({
        label: 'Budget',
        value: String(props.estimated_budget),
      })
    }
  } else if (target.isDeliverable) {
    const goal = Math.max(0, target.quantity)
    const fulfilled = Math.max(0, Number(props.current_quantity || 0))
    const remaining =
      finiteNumber(props.remaining_quantity) != null
        ? Math.max(0, Number(props.remaining_quantity))
        : Math.max(0, goal - fulfilled)
    if (goal > 0) {
      const progress = meterPercent(fulfilled, goal)
      if (progress != null) {
        meters.push({
          title: 'Quantity fulfilment',
          value: `${fulfilled} of ${goal} fulfilled`,
          progress,
          detail: remaining > 0 ? `${remaining} remaining` : null,
        })
      }
    }
  } else {
    const needed = Math.max(
      0,
      Number(props.volunteers_needed || 0) || target.quantity || 0
    )
    const accepted = Math.max(
      0,
      Number(props.accepted_volunteers_count ?? props.volunteers_count ?? 0)
    )
    if (needed > 0) {
      const progress = meterPercent(accepted, needed)
      if (progress != null) {
        meters.push({
          title: 'Accepted volunteers',
          value: `${accepted} of ${needed} accepted`,
          progress,
        })
      }
    } else {
      const quantityGoal = Math.max(0, Number(props.target_quantity || 0))
      const fulfilled = Math.max(0, Number(props.current_quantity || 0))
      if (quantityGoal > 0) {
        const progress = meterPercent(fulfilled, quantityGoal)
        if (progress != null) {
          meters.push({
            title: 'Fulfilment progress',
            value: `${fulfilled} of ${quantityGoal} fulfilled`,
            progress,
          })
        }
      } else if (accepted > 0) {
        stats.push({
          label: 'Accepted volunteers',
          value: `${accepted} accepted`,
        })
      }
    }
  }

  return { meters, stats, contextBits }
}

export type OfferListingPresentation = {
  meters: ListingMeter[]
  stats: ListingStat[]
  contextBits: string[]
}

/** Build marketplace Offer card presentation from existing listing fields only. */
export function getOfferListingPresentation(
  props: Pick<
    ServiceCardProps,
    | 'quantity'
    | 'capacity'
    | 'applications_count'
    | 'pending_applications'
    | 'created_at'
    | 'updated_at'
    | 'item'
    | 'duration'
  >
): OfferListingPresentation {
  const stats: ListingStat[] = []
  const contextBits: string[] = []
  const quantity = finiteNumber(props.quantity)
  const capacity = finiteNumber(props.capacity)
  const offered =
    quantity != null && quantity > 0
      ? quantity
      : capacity != null && capacity > 0
        ? capacity
        : null
  const applications = finiteNumber(props.applications_count)
  const pending = Math.max(0, Number(props.pending_applications || 0))

  if (offered != null) {
    stats.push({
      label: props.item ? 'Offered quantity' : 'Offered capacity',
      value: props.item ? `${offered} ${String(props.item)}` : String(offered),
      detail: props.duration ? `Duration ${props.duration}` : null,
    })
  }

  if (applications != null && applications >= 0) {
    stats.push({
      label: 'Applications',
      value:
        pending > 0
          ? `${applications} received · ${pending} pending`
          : `${applications} received`,
    })
  }

  if (props.updated_at || props.created_at) {
    contextBits.push(`Updated ${formatPostedDate(String(props.updated_at || props.created_at))}`)
  }

  // No progress meters for offers — applications and capacity are statistics, not fulfilment.
  return { meters: [], stats, contextBits }
}
