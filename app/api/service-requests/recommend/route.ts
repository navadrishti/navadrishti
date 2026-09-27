import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { embedText } from '@/lib/embeddings'
import { getErrorMessage } from '@/lib/utils'

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  if (!text) return null
  const parsed = Number(text.replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

// gte-small scores unrelated short texts around 0.75, so similarity only counts
// above SEMANTIC_FLOOR and is scaled from there up to 1.
const SEMANTIC_FLOOR = 0.8
const STRONG_SEMANTIC_MATCH = 0.85

function semanticBoost(similarity: number): number {
  if (similarity <= SEMANTIC_FLOOR) return 0
  return Math.round(((similarity - SEMANTIC_FLOOR) / (1 - SEMANTIC_FLOOR)) * 70)
}

const STOPWORDS = new Set([
  'the','and','for','with','from','that','this','these','those','which','when','where','what','how','a','an','in','on','at','of','to','by','is','are','be'
])

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w))
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const requestType = String(body.request_type || body.requestType || '').trim()
    if (!requestType) return NextResponse.json({ success: true, data: { recommendations: [], suggested_set: [] } })

    const typeMap: Record<string, string> = {
      'Financial Need': 'financial',
      'Material Need': 'material',
      'Skill / Service Need': 'service',
      'Infrastructure Project': 'infrastructure'
    }

    const expectedOfferType = typeMap[requestType] || ''
    if (!expectedOfferType) return NextResponse.json({ success: true, data: { recommendations: [], suggested_set: [] } })

    const needText = `${body.title || ''} ${body.description || ''} ${body.material_items || ''} ${body.skill_role || ''} ${body.infrastructure_scope || ''}`
    const keywords = extractKeywords(needText)

    const targetCoverage = (() => {
      if (requestType === 'Financial Need' || requestType === 'Infrastructure Project') return toNumber(body.target_amount) || toNumber(body.estimated_budget) || null
      if (requestType === 'Material Need' || requestType === 'Skill / Service Need') return toNumber(body.target_quantity) || toNumber(body.beneficiary_count) || null
      return null
    })()

    // Semantic similarity only boosts offers that pass the filters below; if the
    // embed function is unavailable, scoring falls back to keywords and capacity.
    const similarityByOfferId = new Map<number, number>()
    if (needText.trim()) {
      try {
        const embedding = await embedText(needText)
        const { data: matches, error: matchError } = await supabase.rpc('match_service_offers', {
          query_embedding: embedding,
          match_count: 100
        })
        if (matchError) throw matchError
        for (const match of matches || []) {
          similarityByOfferId.set(Number(match.service_offer_id), Number(match.similarity) || 0)
        }
      } catch (err) {
        console.warn('[api/service-requests/recommend] semantic matching skipped:', getErrorMessage(err))
      }
    }

    const { data: offers, error } = await supabase
      .from('service_offers')
      .select('*, ngo:users!creator_id(name)')
      .eq('offer_type', expectedOfferType)
      .in('status', ['active'])
      .limit(200)

    if (error) throw error

    const rows = Array.isArray(offers) ? offers : []

    const now = Date.now()
    const unexpiredRows = rows.filter((row) => {
      if (!row.valid_until) return true
      const expiryMs = Date.parse(String(row.valid_until))
      return Number.isNaN(expiryMs) || expiryMs >= now
    })

    const offerIds = unexpiredRows
      .map((row) => Number(row.id))
      .filter((id) => Number.isFinite(id) && id > 0)

    const usedOfferIds = new Set<number>()
    if (offerIds.length > 0) {
      const { data: usedClients } = await supabase
        .from('service_clients')
        .select('service_offer_id')
        .in('service_offer_id', offerIds)
        .in('status', ['accepted', 'completed', 'active', 'in_progress'])

      for (const client of usedClients || []) {
        usedOfferIds.add(Number(client.service_offer_id))
      }
    }

    const availableRows = unexpiredRows.filter((row) => !usedOfferIds.has(Number(row.id)))

    const candidateMap = new Map<number, any>()

    for (const r of availableRows) {
      const capacity = toNumber(r.price_amount) || null
      candidateMap.set(Number(r.id), {
        id: Number(r.id),
        title: r.title,
        provider_name: r.ngo?.name || null,
        raw: r,
        capacity,
        vector_similarity: similarityByOfferId.get(Number(r.id)) || 0
      })
    }

    const candidates = Array.from(candidateMap.values())

    const scored = candidates.map((offer) => {
      const offerText = `${offer.title || ''} ${String(offer.raw?.description || '')} ${offer.raw?.item || ''} ${offer.raw?.skill || ''} ${offer.raw?.scope || ''}`.toLowerCase()
      let score = 0

      const vecSim = Number(offer.vector_similarity || 0)
      const semanticScore = semanticBoost(vecSim)
      score += semanticScore

      // Whole items from the need's material list, matched as exact phrases.
      const matched_phrases: string[] = []
      const rawItems = String(body.material_items || '').toLowerCase()
      const phraseCandidates = rawItems.split(/[,;|\n]/).map(s => s.trim()).filter(Boolean)
      for (const phrase of phraseCandidates) {
        if (phrase.length < 2) continue
        if (offerText.includes(phrase)) {
          matched_phrases.push(phrase)
        }
      }
      if (matched_phrases.length) {
        score += Math.min(40, matched_phrases.length * 18)
      }

      const keywordMatches = keywords.reduce((matches: string[], k) => {
        const re = new RegExp(`\\b${k.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i')
        if (re.test(offerText)) matches.push(k)
        return matches
      }, [] as string[])
      score += Math.min(30, keywordMatches.length * 6)

      const matched_fields: string[] = []
      if (keywordMatches.length) matched_fields.push('keyword')
      if (matched_phrases.length) matched_fields.push('phrase')
      if (semanticScore > 0) matched_fields.push('semantic')

      const capacity = offer.capacity || null
      const coverageRatio = targetCoverage && capacity ? capacity / targetCoverage : null
      if (coverageRatio !== null) {
        if (coverageRatio >= 1) score += 12
        else score += Math.max(2, Math.floor(coverageRatio * 8))
      }

      if (offer.provider_name) score += 2

      const rationale = coverageRatio === null ? (matched_fields.length ? `Matched by ${matched_fields.join(', ')}` : 'Type and context match') : coverageRatio >= 1 ? 'Can fully fulfill this need' : `Can partially fulfill ~${Math.max(1, Math.round(coverageRatio * 100))}%`

      return {
        id: offer.id,
        title: offer.title,
        provider_name: offer.provider_name,
        score,
        capacity,
        coverageRatio,
        rationale,
        matched_keywords: keywordMatches,
        matched_phrases,
        matched_fields,
        vector_similarity: vecSim
      }
    })

    // Material needs are specific items, so drop offers that match on type and capacity alone.
    let filtered = scored
    if (requestType === 'Material Need') {
      filtered = scored.filter((s) => {
        const hasPhrase = Array.isArray(s.matched_phrases) && s.matched_phrases.length > 0
        const hasKeyword = Array.isArray(s.matched_keywords) && s.matched_keywords.length > 0
        const highSemantic = typeof s.vector_similarity === 'number' && s.vector_similarity >= STRONG_SEMANTIC_MATCH
        return hasPhrase || hasKeyword || highSemantic
      })
    }

    const fullSorted = filtered.sort((a, b) => b.score - a.score)

    const offset = Number.isFinite(Number(body.offset)) ? Math.max(0, Number(body.offset)) : 0
    const limit = Number.isFinite(Number(body.limit)) ? Math.max(1, Math.min(200, Number(body.limit))) : 60
    let recommendations = fullSorted.slice(offset, offset + limit)

    const creatorIds = [
      ...new Set(
        recommendations
          .map((item) => {
            const raw = candidateMap.get(Number(item.id))?.raw || {}
            return Number(raw.creator_id || raw.ngo_id || 0)
          })
          .filter((id: number) => id > 0)
      ),
    ]
    if (creatorIds.length > 0) {
      const { data: creators } = await supabase
        .from('users')
        .select('id, name, verification_status')
        .in('id', creatorIds)
      const creatorById = new Map<number, any>((creators || []).map((row) => [Number(row.id), row]))
      recommendations = recommendations.map((item) => {
        const raw = candidateMap.get(Number(item.id))?.raw || {}
        const creator = creatorById.get(Number(raw.creator_id || raw.ngo_id || 0))
        const providerName = item.provider_name || creator?.name || null
        const verificationStatus = creator?.verification_status || null
        return {
          ...item,
          provider_name: providerName,
          verification_status: verificationStatus,
          verified: String(verificationStatus || '').toLowerCase() === 'verified',
        }
      })
    }

    // Suggested set: the smallest combination of top offers that covers the target
    // with the least excess capacity (at most 6 of the top 12, so 2^12 subsets max).
    const suggested_set: number[] = []
    if (targetCoverage && targetCoverage > 0) {
      const capCandidates = fullSorted.filter((r) => r.capacity && r.capacity > 0).slice(0, 12)
      let best: { ids: number[]; slack: number; totalCapacity: number; count: number; scoreSum: number } | null = null

      const m = capCandidates.length
      const maxMask = 1 << m
      for (let mask = 1; mask < maxMask; mask++) {
        const count = mask.toString(2).replace(/0/g, '').length
        if (count > 6) continue
        let total = 0
        let scoreSum = 0
        const ids: number[] = []
        for (let i = 0; i < m; i++) {
          if ((mask >> i) & 1) {
            total += capCandidates[i].capacity || 0
            scoreSum += capCandidates[i].score || 0
            ids.push(capCandidates[i].id)
          }
        }
        if (total >= targetCoverage) {
          const slack = total - targetCoverage
          if (!best || slack < best.slack || (slack === best.slack && count < best.count) || (slack === best.slack && count === best.count && scoreSum > best.scoreSum)) {
            best = { ids, slack, totalCapacity: total, count, scoreSum }
          }
        }
      }

      if (best) {
        suggested_set.push(...best.ids)
      } else {
        // No subset reaches the target: take the largest offers until it's covered or we run out.
        const capacitySorted = recommendations
          .filter((r) => r.capacity && r.capacity > 0)
          .sort((a, b) => (b.capacity - a.capacity) || (b.score - a.score))

        let accumulated = 0
        for (const r of capacitySorted) {
          if (accumulated >= targetCoverage) break
          suggested_set.push(r.id)
          accumulated += r.capacity || 0
        }
      }
    }

    return NextResponse.json({ success: true, data: { recommendations, suggested_set } })
  } catch (err) {
    console.error('[api/service-requests/recommend]', err)
    return NextResponse.json({ success: false, error: getErrorMessage(err) || 'Failed to compute recommendations' }, { status: 500 })
  }
}
