import { parseBudgetUpperBound, toNumber } from './helpers'
import type { CoverageLabel, NeedDraft, NeedRecommendation, ServerRecommendation, ServiceOfferLite } from './types'

const needTypeToOfferType: Record<string, string> = {
  'Financial Need': 'financial',
  'Material Need': 'material',
  'Skill / Service Need': 'service',
  'Infrastructure Project': 'infrastructure'
}

const getTargetCoverageValue = (need: NeedDraft): number | null => {
  switch (need.request_type) {
    case 'Financial Need':
    case 'Infrastructure Project':
      return toNumber(need.target_amount) || toNumber(need.estimated_budget) || parseBudgetUpperBound(need.budget)
    case 'Material Need':
    case 'Skill / Service Need':
      return toNumber(need.target_quantity) || toNumber(need.beneficiary_count)
    default:
      return null
  }
}

const getOfferCapacityForNeed = (need: NeedDraft, offer: ServiceOfferLite): number | null => {
  switch (need.request_type) {
    case 'Financial Need':
      return toNumber(offer.amount) || toNumber(offer.sell_amount)
    case 'Material Need':
      return toNumber(offer.quantity)
    case 'Skill / Service Need':
      return toNumber(offer.capacity)
    case 'Infrastructure Project':
      return toNumber(offer.amount) || toNumber(offer.sell_amount) || toNumber(offer.capacity)
    default:
      return null
  }
}

export function getNeedRecommendations(need: NeedDraft, serviceOffers: ServiceOfferLite[]): NeedRecommendation[] {
  const expectedOfferType = needTypeToOfferType[need.request_type || '']
  const needText = `${need.title} ${need.description} ${need.material_items} ${need.skill_role} ${need.infrastructure_scope}`.toLowerCase()
  const targetCoverage = getTargetCoverageValue(need)

  return serviceOffers
    .map((offer) => {
      const offerType = String(offer.offer_type || '').toLowerCase()
      const offerText = `${offer.title} ${offer.description || ''} ${offer.item || ''} ${offer.skill || ''} ${offer.scope || ''}`.toLowerCase()

      let score = 0
      if (expectedOfferType && offerType === expectedOfferType) score += 60

      const keywords = needText.split(/\s+/).filter((word) => word.length > 3)
      const keywordMatches = keywords.reduce((count, word) => count + (offerText.includes(word) ? 1 : 0), 0)
      score += Math.min(30, keywordMatches * 3)

      const capacity = getOfferCapacityForNeed(need, offer)
      const coverageRatio = targetCoverage && capacity ? capacity / targetCoverage : null

      let coverageLabel: CoverageLabel = 'possible'
      if (coverageRatio !== null) {
        if (coverageRatio >= 1) {
          coverageLabel = 'full'
          score += 10
        } else if (coverageRatio > 0) {
          coverageLabel = 'partial'
          score += Math.max(2, Math.floor(coverageRatio * 10))
        }
      }

      const rationale = coverageRatio === null
        ? 'Type and context match'
        : coverageRatio >= 1
          ? 'Can fully fulfill this need'
          : `Can partially fulfill ~${Math.max(1, Math.round(coverageRatio * 100))}%`

      return {
        offer,
        score,
        coverageRatio,
        coverageLabel,
        rationale
      }
    })
    .filter((recommendation) => {
      if (!expectedOfferType) return false
      return String(recommendation.offer.offer_type || '').toLowerCase() === expectedOfferType
    })
    .sort((a, b) => b.score - a.score)
}

export function mapServerToNeedRecommendation(rec: ServerRecommendation): NeedRecommendation {
  const coverageRatio = typeof rec.coverageRatio === 'number' ? rec.coverageRatio : null
  const coverageLabel: CoverageLabel = coverageRatio === null ? 'possible' : coverageRatio >= 1 ? 'full' : 'partial'
  const offer: ServiceOfferLite = {
    id: Number(rec.id),
    title: rec.title,
    provider_name: rec.provider_name || null,
    verification_status: rec.verification_status || null,
    verified: Boolean(rec.verified) || String(rec.verification_status || '').toLowerCase() === 'verified',
  }
  return {
    offer,
    score: Number(rec.score) || 0,
    coverageRatio,
    coverageLabel,
    rationale: rec.rationale || '',
    matched_keywords: Array.isArray(rec.matched_keywords) ? rec.matched_keywords : [],
    matched_phrases: Array.isArray(rec.matched_phrases) ? rec.matched_phrases : [],
    matched_fields: Array.isArray(rec.matched_fields) ? rec.matched_fields : [],
    vector_similarity: typeof rec.vector_similarity === 'number' ? rec.vector_similarity : undefined
  }
}
