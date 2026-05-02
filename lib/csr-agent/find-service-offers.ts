import {supabase} from '@/lib/db';
import {z} from "zod";
import { embedText } from "@/lib/embeddings/embedding";
import { makeServiceOfferQuery } from "@/lib/embeddings/queryMaker";

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

/* ───────────────── SCORING ───────────────── */

const scoreMatch = ( match: Omit<CapabilityMatch, 'score'> , input: InputSchemaType): number => {
    let score = 0

    // similarity from vector search (0-1) — weight 40%
    score += match.similarity * 40

    // impact_area match
    if (match.impact_area?.includes(input.category.toLowerCase())) {
        score += 20
    }
    //******************************************************(use city/state from input schema)**************************************************************************
    const inputCity = (input.city || '').trim().toLowerCase()
    const inputState = (input.state_province || '').trim().toLowerCase()

    if (inputCity && match.city?.toLowerCase() === inputCity) score += 15
    else if (inputState && match.state_province?.toLowerCase() === inputState) score += 8

    // price within budget — fix: handle free, negotiable, null
    const price = match.price_amount ?? 0 
    if (match.price_type === 'free' || price === 0) score += 10
    else if (match.price_type === 'negotiable') score += 7
    else if (price <= input.budget) score += 10
    else score -= 20

    // generic keyword boost
    const titleWords = input.title.toLowerCase().split(' ')
    const capName = match.capability_name.toLowerCase()
    const keywordMatch = titleWords.some(word =>
        word.length > 4 && capName.includes(word)
    )
    if (keywordMatch) score += 5

    return Math.round(score)
}

/* ───────────────── SERVICE ───────────────── */

export const findServiceOffers = async (input: InputSchemaType): Promise<CapabilityMatch[]> => {

    // validation done in route handler. Input is valid

    // SQL filters - change kar sakte hain bad me for more complex logic (e.g. location parsing, category hierarchy)
    const { data: filteredOffers, error: filterError } = await supabase
        .from('service_offers')
        .select(`
            id,
            offer_type,
            transaction_type,
            impact_area,
            city,
            state_province,
            price_amount,
            price_type,
            offer_capabilities ( id )
        `)
        .eq('status', 'active')
        .eq('admin_status', 'approved')
        .overlaps('impact_area', [input.category.toLowerCase()])
        .or(`price_type.neq.fixed,price_amount.lte.${input.budget}`)

    if (filterError) {
        throw new Error(`Error fetching service offers: ${filterError.message}`)
    }
    if (!filteredOffers || filteredOffers.length === 0) return []

    // build capability → offer lookup map (O(1)) + extract ids
    const capabilityToOffer = new Map<number, typeof filteredOffers[0]>()
    filteredOffers.forEach(offer => {
        (offer.offer_capabilities as { id: number }[]).forEach(c => {
            capabilityToOffer.set(c.id, offer)
        })
    })
    // only these ids will be used in vector search to limit scope and cost
    const capabilityIds = Array.from(capabilityToOffer.keys())

    if (capabilityIds.length === 0) return []

    // embedding + vector search
    // makeServiceOfferQuery expects a `location` string — compose from city/state
    const queryPayload = {
        title: input.title,
        description: input.description,
        category: input.category,
        city: input.city,
        state_province: input.state_province,
        budget: input.budget,
        start_date: input.start_date,
        end_date: input.end_date,
        requirementDetails: input.requirementDetails,
    }
    const queryText = makeServiceOfferQuery(queryPayload)
    const embedding = await embedText(queryText)

    const { data: vectorMatches, error: vectorError } = await supabase
        .rpc('match_capabilities', {
            query_embedding: embedding,
            match_count: 20,
            filter_ids: capabilityIds
        })

    if (vectorError) {
        throw new Error(`Error during vector search: ${vectorError.message}`)
    }
    if (!vectorMatches || vectorMatches.length === 0) return []

    // guardrail: drop low similarity results
    const guardrailed = vectorMatches.filter((m: any) => m.similarity > 0.4)

    if (guardrailed.length === 0) return []

    // scoring + re-rank
    const scored: CapabilityMatch[] = guardrailed
        .map((match: any) => {
            const parentOffer = capabilityToOffer.get(match.capability_id)
            if (!parentOffer) return null

            const raw: Omit<CapabilityMatch, 'score'> = {
                capability_id:    match.capability_id,
                capability_name:  match.capability_name,
                similarity:       match.similarity,
                service_offer_id: parentOffer.id,
                offer_type:       parentOffer.offer_type,
                transaction_type: parentOffer.transaction_type,
                impact_area:      parentOffer.impact_area,
                city:             parentOffer.city,
                state_province:   parentOffer.state_province,
                price_amount:     parentOffer.price_amount ?? 0,
                price_type:       parentOffer.price_type,
            }

            return {...raw , score: scoreMatch(raw, input)}
        })
        .filter(Boolean) as CapabilityMatch[]

    // sort by final score descending
    const ranked = scored.sort((a, b) => b.score - a.score)
    return ranked
}