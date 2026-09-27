import crypto from 'crypto'
import { supabase } from '@/lib/db'
import { parseJsonObject } from '@/lib/utils'

export async function embedText(text: string): Promise<number[]> {
  const { data, error } = await supabase.functions.invoke('embed', {
    body: { input: text },
  })

  if (error) {
    throw new Error(`Supabase embed error: ${error.message}`)
  }

  const embedding: number[] = data?.embedding

  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error('Empty embedding returned from Supabase')
  }

  return embedding
}

function textList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean)
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  return []
}

export function buildServiceOfferEmbeddingText(offer: {
  title?: string | null
  description?: string | null
  offer_type?: string | null
  impact_area?: unknown
  tags?: unknown
  requirements?: unknown
  city?: string | null
  state_province?: string | null
  offer_details?: unknown
}): string {
  const details = Object.values(parseJsonObject(offer.offer_details)).flatMap(textList)
  return [
    offer.title,
    offer.description,
    offer.offer_type ? `Type: ${offer.offer_type}` : null,
    ...textList(offer.impact_area),
    ...textList(offer.tags),
    ...textList(offer.requirements),
    ...details,
    [offer.city, offer.state_province].filter(Boolean).join(', '),
  ]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join('\n')
}

/** Re-embeds an offer only when the text it is built from has changed. */
export async function syncServiceOfferEmbedding(offerId: number): Promise<'embedded' | 'unchanged' | 'missing'> {
  const { data: offer, error } = await supabase
    .from('service_offers')
    .select('id, title, description, offer_type, impact_area, tags, requirements, city, state_province, offer_details')
    .eq('id', offerId)
    .maybeSingle()
  if (error) throw error
  if (!offer) return 'missing'

  const text = buildServiceOfferEmbeddingText(offer)
  if (!text) return 'missing'
  const contentHash = crypto.createHash('sha256').update(text).digest('hex')

  const { data: existing } = await supabase
    .from('service_offer_embeddings')
    .select('content_hash')
    .eq('service_offer_id', offerId)
    .maybeSingle()
  if (existing?.content_hash === contentHash) return 'unchanged'

  const embedding = await embedText(text)
  const { error: upsertError } = await supabase
    .from('service_offer_embeddings')
    .upsert(
      { service_offer_id: offerId, embedding, content_hash: contentHash, updated_at: new Date().toISOString() },
      { onConflict: 'service_offer_id' }
    )
  if (upsertError) throw upsertError
  return 'embedded'
}

/** Embeds active offers that don't have an embedding yet. */
export async function backfillServiceOfferEmbeddings(limit = 50) {
  const stats = { embedded: 0, failed: 0 }

  const { data: offers, error } = await supabase
    .from('service_offers')
    .select('id')
    .eq('status', 'active')
    .limit(2000)
  if (error) throw error

  const offerIds = (offers || []).map((offer) => Number(offer.id))
  if (offerIds.length === 0) return stats

  const { data: embedded, error: embeddedError } = await supabase
    .from('service_offer_embeddings')
    .select('service_offer_id')
  if (embeddedError) throw embeddedError

  const done = new Set((embedded || []).map((row) => Number(row.service_offer_id)))
  for (const offerId of offerIds.filter((id) => !done.has(id)).slice(0, limit)) {
    try {
      if ((await syncServiceOfferEmbedding(offerId)) === 'embedded') stats.embedded += 1
    } catch (err) {
      stats.failed += 1
      console.error(`offer embedding backfill: failed for offer ${offerId}`, err)
    }
  }

  return stats
}
