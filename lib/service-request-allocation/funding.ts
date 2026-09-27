import { parseAmountToInr } from '@/lib/utils'

/** Parse preset budget range labels into a numeric INR upper bound. */
export function parseBudgetUpperBound(budget: unknown): number {
  const text = String(budget || '').trim()
  if (!text || /negotiable/i.test(text)) return 0

  const underMatch = text.match(/under\s+(?:₹|inr)?\s*([\d,]+)/i)
  if (underMatch) return parseAmountToInr(underMatch[1])

  const rangeMatch = text.match(/(?:₹|inr)?\s*([\d,]+)\s*-\s*(?:₹|inr)?\s*([\d,]+)/i)
  if (rangeMatch) return parseAmountToInr(rangeMatch[2])

  const plusMatch = text.match(/(?:₹|inr)?\s*([\d,]+)\+/i)
  if (plusMatch) return parseAmountToInr(plusMatch[1])

  const plain = parseAmountToInr(text)
  if (plain > 0 && !text.includes('-')) return plain

  return 0
}

type FundingSource = {
  funding_target_inr?: unknown
  target_amount?: unknown
  estimated_budget?: unknown
  budget?: unknown
}

export function resolveFundingTargetInr(source: FundingSource): number {
  const explicit = parseAmountToInr(source.funding_target_inr)
  if (explicit > 0) return explicit

  const targetAmount = parseAmountToInr(source.target_amount)
  if (targetAmount > 0) return targetAmount

  const budgetText = String(source.budget || source.estimated_budget || '')
  const fromRange = parseBudgetUpperBound(budgetText)
  if (fromRange > 0) return fromRange

  const estimated = parseAmountToInr(source.estimated_budget)
  if (estimated > 0 && !budgetText.includes('-')) return estimated

  return 0
}

export function getFundingProgress(targetInr: number, raisedInr: number) {
  const target = Math.max(0, targetInr)
  const raised = Math.max(0, raisedInr)
  const remaining = Math.max(0, target - raised)
  const progress = target > 0 ? Math.min(100, Math.round((raised / target) * 100)) : 0
  return { target, raised, remaining, progress }
}
