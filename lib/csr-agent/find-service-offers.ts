import {supabase} from '@/lib/db';
import {z} from "zod";

/* ───────────────── SCHEMAS ───────────────── */

export const InputSchema = z.object({
    title: z.string(),
    description: z.string(),
    category: z.string(),
    city: z.string(),
    state_province: z.string(),
    budget: z.number().positive(),
    start_date: z.coerce.date(),
    end_date: z.coerce.date(),
    requirementDetails: z.string(),
}).refine(
    (data) => data.start_date < data.end_date,
    {message: "start_date must be before end_date" , path: ["end_date"]},
)

export type InputSchemaType = z.infer<typeof InputSchema>;

/* ───────────────── TYPES ───────────────── */

export type CapabilityMatch = {
    capability_id: number
    capability_name: string
    similarity: number
    service_offer_id: number
    offer_type: string
    transaction_type: string
    impact_area: string[]
    city: string
    state_province: string
    price_amount: number
    price_type: string
    score: number
}

type ServiceOfferRow = {
    id: number
    title: string | null
    description: string | null
    offer_type: string | null
    transaction_type: string | null
    impact_area: unknown
    city: string | null
    state_province: string | null
    price_amount: number | string | null
    price_type: string | null
    requirements: unknown
    tags: unknown
    valid_until?: string | null
}

const toNumber = (value: unknown): number => {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
}

const normalizeText = (value: unknown): string => {
    if (value === null || value === undefined) return ''
    if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean).join(' ')
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value)
        } catch {
            return ''
        }
    }
    return String(value)
}

const tokenize = (value: string): string[] =>
    value
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length > 2)

const splitToList = (value: unknown): string[] => {
    const text = normalizeText(value)
    if (!text) return []

    return text
        .split(/[;,|]/)
        .map((entry) => entry.trim())
        .filter(Boolean)
}

const overlapRatio = (haystack: string, tokens: string[]): number => {
    if (tokens.length === 0) return 0

    let hits = 0
    for (const token of tokens) {
        if (haystack.includes(token)) hits += 1
    }

    return hits / tokens.length
}

const computeCategoryScore = (offer: ServiceOfferRow, input: InputSchemaType, categoryTokens: string[]): number => {
    const categoryNeedle = input.category.trim().toLowerCase()
    const impactList = splitToList(offer.impact_area).map((s) => s.toLowerCase())
    const reqList = splitToList(offer.requirements).map((s) => s.toLowerCase())
    const tagList = splitToList(offer.tags).map((s) => s.toLowerCase())
    const offerTitle = normalizeText(offer.title).toLowerCase()

    if (impactList.some((v) => v === categoryNeedle)) return 1
    if (impactList.some((v) => v.includes(categoryNeedle))) return 0.9
    if (reqList.some((v) => v.includes(categoryNeedle))) return 0.7
    if (tagList.some((v) => v.includes(categoryNeedle))) return 0.6
    if (offerTitle.includes(categoryNeedle)) return 0.6

    return overlapRatio(normalizeText([offer.title, offer.description, offer.impact_area, offer.requirements, offer.tags]).toLowerCase(), categoryTokens)
}

const buildSimilarity = (
    offer: ServiceOfferRow,
    input: InputSchemaType,
    titleTokens: string[],
    descriptionTokens: string[],
    requirementTokens: string[],
    categoryTokens: string[]
): number => {
    const offerTitle = normalizeText(offer.title).toLowerCase()
    const offerText = normalizeText([
        offer.title,
        offer.description,
        offer.impact_area,
        offer.requirements,
        offer.tags,
    ]).toLowerCase()

    const titleOverlap = overlapRatio(offerTitle, titleTokens)
    const descriptionOverlap = overlapRatio(offerText, descriptionTokens)
    const requirementOverlap = overlapRatio(offerText, requirementTokens)
    const categoryOverlap = overlapRatio(offerText, categoryTokens)

    const titlePhrase = input.title.trim().toLowerCase()
    const requirementPhrase = input.requirementDetails.trim().toLowerCase()

    const exactTitleBonus = titlePhrase && offerTitle.includes(titlePhrase) ? 0.08 : 0
    const exactRequirementBonus = requirementPhrase && offerText.includes(requirementPhrase) ? 0.06 : 0

    // CategoryScore will be computed by the helper below when needed by caller.
    // Use categoryOverlap here as a fallback signal when structured fields are absent.
    const rawSimilarity =
        (categoryOverlap * 0.65) +
        (titleOverlap * 0.18) +
        (requirementOverlap * 0.09) +
        (descriptionOverlap * 0.02) +
        exactTitleBonus +
        exactRequirementBonus

    return Math.min(0.95, Math.max(0.2, 0.2 + rawSimilarity))
}

/* ───────────────── SCORING ───────────────── */

const scoreMatch = ( match: Omit<CapabilityMatch, 'score'> , input: InputSchemaType): number => {
    let score = 0

    // similarity from direct text matching (0-1) — use 23 as the multiplier
    score += match.similarity * 23

    // small explicit category boost (most category influence is in similarity)
    const normalizedImpactAreas = (match.impact_area || []).map((area) => String(area).trim().toLowerCase())
    const categoryNeedle = input.category.trim().toLowerCase()
    if (normalizedImpactAreas.includes(categoryNeedle) || normalizedImpactAreas.some((area) => area.includes(categoryNeedle))) {
        score += 10
    }

    // Location weighting: city then state, give them strong influence
    const inputCity = (input.city || '').trim().toLowerCase()
    const inputState = (input.state_province || '').trim().toLowerCase()

    const offerCity = (match.city || '').trim().toLowerCase()
    const offerState = (match.state_province || '').trim().toLowerCase()

    if (inputCity && offerCity === inputCity) score += 30
    if (inputState && offerState === inputState) score += 20
    if (inputCity && inputState && offerCity === inputCity && offerState === inputState) score += 10

    // price within budget — fix: handle free, negotiable, null
    const price = match.price_amount ?? 0 
    if (match.price_type === 'free' || price === 0) score += 10
    else if (match.price_type === 'negotiable') score += 7
    else if (price <= input.budget) score += 10
    else score -= 20

    // generic keyword boost (smaller influence)
    const titleWords = input.title.toLowerCase().split(' ')
    const capName = match.capability_name.toLowerCase()
    const keywordMatch = titleWords.some(word =>
        word.length > 4 && capName.includes(word)
    )
    if (keywordMatch) score += 3

    return Math.round(score)
}

/* ───────────────── SERVICE ───────────────── */

export const findServiceOffers = async (input: InputSchemaType): Promise<CapabilityMatch[]> => {

    // validation done in route handler. Input is valid

    const queryText = `${input.title} ${input.description} ${input.category} ${input.requirementDetails}`
    const queryTokens = tokenize(queryText)
    const titleTokens = tokenize(input.title)
    const descriptionTokens = tokenize(input.description)
    const requirementTokens = tokenize(input.requirementDetails)
    const categoryTokens = tokenize(input.category)

    // Directly query service_offers because the table stores impact_area as text.
    const { data: filteredOffers, error: filterError } = await supabase
        .from('service_offers')
        .select(`
            id,
            title,
            description,
            offer_type,
            transaction_type,
            impact_area,
            city,
            state_province,
            price_amount,
            price_type,
            requirements,
            tags,
            valid_until
        `)
        .eq('status', 'active')
        .eq('admin_status', 'approved')
        .or(`price_type.neq.fixed,price_amount.lte.${input.budget}`)
        .limit(200)

    if (filterError) {
        throw new Error(`Error fetching service offers: ${filterError.message}`)
    }
    if (!filteredOffers || filteredOffers.length === 0) {
        console.log("No offers passed initial filters")
        return []
    }

    const now = Date.now()
    const activeOffers = (filteredOffers as ServiceOfferRow[]).filter((offer) => {
        const expiryValue = (offer as any).valid_until
        if (!expiryValue) return true
        const expiryMs = Date.parse(String(expiryValue))
        if (Number.isNaN(expiryMs)) return true
        return expiryMs >= now
    })

    if (activeOffers.length === 0) {
        return []
    }

    const offerIds = activeOffers
        .map((offer) => Number(offer.id))
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

    const availableOffers = activeOffers.filter((offer) => !usedOfferIds.has(Number(offer.id)))

    if (availableOffers.length === 0) {
        return []
    }

    const categoryNeedle = input.category.trim().toLowerCase()
    const cityNeedle = input.city.trim().toLowerCase()
    const stateNeedle = input.state_province.trim().toLowerCase()

    const scored: CapabilityMatch[] = availableOffers
        .map((offer) => {
            const impactAreas = splitToList(offer.impact_area)
            const requirements = splitToList(offer.requirements)
            const tags = splitToList(offer.tags)
            const similarity = buildSimilarity(
                offer,
                input,
                titleTokens,
                descriptionTokens,
                requirementTokens,
                categoryTokens
            )

            const categoryScore = computeCategoryScore(offer, input, categoryTokens)
            if (process.env.NODE_ENV !== 'production') {
                console.log(`recommendation-debug offer=${offer.id} title="${offer.title}" similarity=${similarity.toFixed(3)} categoryScore=${categoryScore}`)
            }

            const raw: Omit<CapabilityMatch, 'score'> = {
                capability_id: offer.id,
                capability_name: offer.title || 'Capability Offer',
                similarity,
                service_offer_id: offer.id,
                offer_type: offer.offer_type || 'unknown',
                transaction_type: offer.transaction_type || 'unknown',
                impact_area: impactAreas,
                city: offer.city || '',
                state_province: offer.state_province || '',
                price_amount: toNumber(offer.price_amount),
                price_type: offer.price_type || 'unknown',
            }

            // additive boosts — keep these smaller so primary ordering remains:
            // category influence already applied; keep title/location boosts modest
            // boost based on computed categoryScore to ensure category drives ordering
            const categoryBoost = categoryScore >= 0.95 ? 40 : categoryScore >= 0.9 ? 30 : categoryScore >= 0.7 ? 15 : categoryScore >= 0.6 ? 8 : 0
            const score = scoreMatch(raw, input) +
                categoryBoost +
                Math.round(overlapRatio(normalizeText(offer.title).toLowerCase(), titleTokens) * 6) +
                Math.round(overlapRatio(normalizeText(offer.description).toLowerCase(), requirementTokens) * 3) +
                (requirements.some((value) => value.toLowerCase().includes(categoryNeedle)) ? 6 : 0) +
                (tags.some((value) => value.toLowerCase().includes(categoryNeedle)) ? 4 : 0) +
                ((cityNeedle && offer.city?.toLowerCase() === cityNeedle) ? 4 : 0) +
                ((stateNeedle && offer.state_province?.toLowerCase() === stateNeedle) ? 2 : 0)

            return { ...raw, score }
        })
        .filter((item) => {
            const text = `${item.capability_name} ${item.impact_area.join(' ')} ${item.city} ${item.state_province}`.toLowerCase()
            return (
                text.includes(categoryNeedle) ||
                item.score >= 18 ||
                queryTokens.some((token) => text.includes(token)) ||
                categoryTokens.some((token) => text.includes(token))
            )
        })

    // sort by final score descending
    const ranked = scored.sort((a, b) => b.score - a.score)
    if (ranked.length === 0) return []

    const strongMatches = ranked.filter((item) => item.score >= 20)
    return (strongMatches.length > 0 ? strongMatches : ranked).slice(0, 10)
}