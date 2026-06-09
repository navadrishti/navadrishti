import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { embedText } from '@/lib/embeddings/embedding'

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  if (!text) return null
  const parsed = Number(text.replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
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

    // Step A: try vector search using embeddings (if available)
    let vectorCandidates: any[] = []
    try {
      const embedding = await embedText(needText)
      const { data: vectorMatches } = await supabase.rpc('match_ngo_service', {
        query_embedding: embedding,
        match_count: 100
      })

      if (Array.isArray(vectorMatches)) {
        vectorCandidates = vectorMatches
          .filter((m: any) => m.source === 'service_offer' || m.entity_type === 'service_offer' || String(m.source) === 'service_offer')
          .map((m: any) => ({ id: Number(m.entity_id), similarity: Number(m.similarity || 0), metadata: m.metadata || {} }))
      }
    } catch (err) {
      // embedding or vector search failed — fall back to lexical matching below
    }

    // Step B: fetch direct offers as fallback/augmentation
    const { data: offers, error } = await supabase
      .from('service_offers')
      .select('*')
      .eq('offer_type', expectedOfferType)
      .in('status', ['active'])
      .limit(200)

    if (error) throw error

    const rows = Array.isArray(offers) ? offers : []

    // Build candidate map from vector results and direct rows
    const candidateMap = new Map<number, any>()

    for (const r of rows) {
      const capacity = toNumber(r.capacity) || toNumber(r.quantity) || toNumber(r.amount) || toNumber(r.price_amount) || toNumber(r.sell_amount) || null
      candidateMap.set(Number(r.id), {
        id: Number(r.id),
        title: r.title,
        provider_name: r.provider_name || r.ngo_name || null,
        raw: r,
        capacity,
        vector_similarity: 0
      })
    }

    for (const v of vectorCandidates) {
      const id = Number(v.id)
      const existing = candidateMap.get(id)
      if (existing) {
        existing.vector_similarity = Math.max(existing.vector_similarity || 0, v.similarity || 0)
      } else {
        // metadata may contain title/provider
        candidateMap.set(id, {
          id,
          title: v.metadata?.title || v.metadata?.capability_name || `Offer ${id}`,
          provider_name: v.metadata?.provider_name || v.metadata?.ngo_name || null,
          raw: v.metadata || {},
          capacity: toNumber(v.metadata?.capacity) || toNumber(v.metadata?.quantity) || null,
          vector_similarity: Number(v.similarity || 0)
        })
      }
    }

    const candidates = Array.from(candidateMap.values())

    // Score candidates combining vector similarity, keyword overlap, phrase matching, and capacity
    const scored = candidates.map((offer: any) => {
      const offerText = `${offer.title || ''} ${String(offer.raw?.description || '')} ${offer.raw?.item || ''} ${offer.raw?.skill || ''} ${offer.raw?.scope || ''}`.toLowerCase()
      let score = 0

      // vector similarity influence (increased weight)
      const vecSim = Number(offer.vector_similarity || 0)
      if (vecSim > 0) score += Math.round(vecSim * 70) // stronger semantic boost

      // phrase / exact item matches (stricter): prefer exact multi-word phrases from material_items or skill_role
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

      // keyword overlap (reduced influence, stricter whole-word matching)
      const keywordMatches = keywords.reduce((matches: string[], k) => {
        const re = new RegExp(`\\b${k.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i')
        if (re.test(offerText)) matches.push(k)
        return matches
      }, [] as string[])
      score += Math.min(30, keywordMatches.length * 6)

      // collect matched fields/tokens for explanation
      const matched_fields: string[] = []
      if (keywordMatches.length) matched_fields.push('keyword')
      if (matched_phrases.length) matched_fields.push('phrase')
      if (vecSim > 0) matched_fields.push('semantic')

      const capacity = offer.capacity || null
      const coverageRatio = targetCoverage && capacity ? capacity / targetCoverage : null
      if (coverageRatio !== null) {
        if (coverageRatio >= 1) score += 12 // reduced full-capacity bonus
        else score += Math.max(2, Math.floor(coverageRatio * 8))
      }

      if (offer.provider_name) score += 2 // smaller provider boost

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

    // For stricter filtering on Material Needs, require either a phrase/keyword match or high semantic similarity
    let filtered = scored
    if (requestType === 'Material Need') {
      filtered = scored.filter((s: any) => {
        const hasPhrase = Array.isArray(s.matched_phrases) && s.matched_phrases.length > 0
        const hasKeyword = Array.isArray(s.matched_keywords) && s.matched_keywords.length > 0
        const highSemantic = typeof s.vector_similarity === 'number' && s.vector_similarity >= 0.75
        return hasPhrase || hasKeyword || highSemantic
      })
    }

    const fullSorted = filtered.sort((a: any, b: any) => b.score - a.score)

    // support pagination via offset/limit
    const offset = Number.isFinite(Number(body.offset)) ? Math.max(0, Number(body.offset)) : 0
    const limit = Number.isFinite(Number(body.limit)) ? Math.max(1, Math.min(200, Number(body.limit))) : 60
    const recommendations = fullSorted.slice(offset, offset + limit)

    // Improved cover selection: search small subsets among top candidates for minimal slack
    const suggested_set: number[] = []
    if (targetCoverage && targetCoverage > 0) {
      // use top candidates from the full sorted list for cover selection
      const capCandidates = fullSorted.filter((r: any) => r.capacity && r.capacity > 0).slice(0, 12)
      let best: { ids: number[]; slack: number; totalCapacity: number; count: number; scoreSum: number } | null = null

      const m = capCandidates.length
      // enumerate subsets via bitmask but limit subset size to 6
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
        // fallback greedy accumulation by capacity then score
        const capacitySorted = recommendations
          .filter((r: any) => r.capacity && r.capacity > 0)
          .sort((a: any, b: any) => (b.capacity - a.capacity) || (b.score - a.score))

        let accumulated = 0
        for (const r of capacitySorted) {
          if (accumulated >= targetCoverage) break
          suggested_set.push(r.id)
          accumulated += r.capacity || 0
        }
      }
    }

    return NextResponse.json({ success: true, data: { recommendations, suggested_set } })
  } catch (err: any) {
    console.error('[api/service-requests/recommend]', err)
    return NextResponse.json({ success: false, error: err?.message || 'Failed to compute recommendations' }, { status: 500 })
  }
}
