import 'server-only'
import { supabase } from '@/lib/db'

export type VerificationActorType = 'individual' | 'ngo' | 'company'

export type VerificationDocumentRow = {
  id?: string
  user_id: number
  actor_type: VerificationActorType
  doc_key: string
  file_url?: string | null
  doc_number?: string | null
  valid_until?: string | null
  status?: string | null
  uploaded_at?: string | null
  reviewed_at?: string | null
  reviewed_by_platform_ca_id?: number | null
  metadata?: Record<string, unknown> | null
}

/**
 * First-class KYC document store (target table: verification_documents).
 * Falls back silently when the table is not yet applied on the live DB.
 */
export async function upsertVerificationDocument(
  row: VerificationDocumentRow
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  try {
    const payload = {
      user_id: row.user_id,
      actor_type: row.actor_type,
      doc_key: row.doc_key,
      file_url: row.file_url ?? null,
      doc_number: row.doc_number ?? null,
      valid_until: row.valid_until ?? null,
      status: row.status || 'uploaded',
      uploaded_at: row.uploaded_at || new Date().toISOString(),
      reviewed_at: row.reviewed_at ?? null,
      reviewed_by_platform_ca_id: row.reviewed_by_platform_ca_id ?? null,
      metadata: row.metadata || {},
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase.from('verification_documents').upsert(payload, {
      onConflict: 'user_id,actor_type,doc_key',
    })

    if (error) {
      // Table missing until migration applied — non-fatal during cutover
      if (/verification_documents|does not exist|schema cache/i.test(String(error.message || ''))) {
        return { ok: false, skipped: true, error: error.message }
      }
      return { ok: false, error: error.message }
    }
    return { ok: true }
  } catch (error: any) {
    return { ok: false, skipped: true, error: String(error?.message || error) }
  }
}

export async function listVerificationDocuments(userId: number): Promise<VerificationDocumentRow[]> {
  try {
    const { data, error } = await supabase
      .from('verification_documents')
      .select('*')
      .eq('user_id', userId)

    if (error || !Array.isArray(data)) return []
    return data as VerificationDocumentRow[]
  } catch {
    return []
  }
}

/** Map table rows into the legacy profile_data.document_expiries shape for helpers. */
export function documentExpiriesFromRows(
  rows: VerificationDocumentRow[]
): Record<string, { number?: string | null; valid_until?: string | null; label?: string }> {
  const out: Record<string, { number?: string | null; valid_until?: string | null; label?: string }> = {}
  for (const row of rows) {
    if (!row.doc_key) continue
    out[row.doc_key] = {
      number: row.doc_number || null,
      valid_until: row.valid_until || null,
      label: row.doc_key,
    }
  }
  return out
}

/**
 * Sync a map of uploaded document URLs into verification_documents.
 * Keeps profile_data as compatibility mirror until staging cutover completes.
 */
export async function syncActorDocumentsToTable(options: {
  userId: number
  actorType: VerificationActorType
  documents?: Record<string, string | null | undefined> | null
  numbers?: Record<string, string | null | undefined> | null
  expiries?: Record<string, string | null | undefined> | null
  status?: string
}): Promise<void> {
  const docs = options.documents || {}
  for (const [docKey, fileUrl] of Object.entries(docs)) {
    const url = String(fileUrl || '').trim()
    if (!docKey || !url) continue
    await upsertVerificationDocument({
      user_id: options.userId,
      actor_type: options.actorType,
      doc_key: docKey,
      file_url: url,
      doc_number: options.numbers?.[docKey] ? String(options.numbers[docKey]) : null,
      valid_until: options.expiries?.[docKey] ? String(options.expiries[docKey]) : null,
      status: options.status || 'uploaded',
    })
  }
}
