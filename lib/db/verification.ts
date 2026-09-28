import 'server-only'
import type { Json, TablesInsert, TablesUpdate } from '@/lib/database.types'
import { getErrorMessage } from '@/lib/utils'
import { supabase } from './client'

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
  metadata?: Json | null
}

export const individualVerifications = {
  async findByUserId(userId: number) {
    const { data, error } = await supabase
      .from('individual_verifications')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async create(verificationData: TablesInsert<'individual_verifications'>) {
    const { data, error } = await supabase
      .from('individual_verifications')
      .insert(verificationData)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async update(
    userId: number,
    updateData: TablesUpdate<'individual_verifications'> & {
      aadhaar_verification_date?: string | null
      pan_verification_date?: string | null
    }
  ) {
    const { aadhaar_verification_date, pan_verification_date, ...payload } = updateData;
    // Canonical columns are aadhaar_verified_at / pan_verified_at
    if ('aadhaar_verification_date' in updateData && payload.aadhaar_verified_at == null) {
      payload.aadhaar_verified_at = aadhaar_verification_date;
    }
    if ('pan_verification_date' in updateData && payload.pan_verified_at == null) {
      payload.pan_verified_at = pan_verification_date;
    }

    const { data, error } = await supabase
      .from('individual_verifications')
      .update(payload)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async upsert(verificationData: TablesInsert<'individual_verifications'>) {
    const { data, error } = await supabase
      .from('individual_verifications')
      .upsert(verificationData, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}

export const verificationDocuments = {
  async upsert(row: VerificationDocumentRow): Promise<{ ok: boolean; error?: string }> {
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

      if (error) return { ok: false, error: error.message }
      return { ok: true }
    } catch (error) {
      return { ok: false, error: getErrorMessage(error) }
    }
  },

  async listByUserId(userId: number): Promise<VerificationDocumentRow[]> {
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
  },

  /** Sync uploaded document URLs into verification_documents (profile_data remains a mirror). */
  async syncActorDocuments(options: {
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
      await verificationDocuments.upsert({
        user_id: options.userId,
        actor_type: options.actorType,
        doc_key: docKey,
        file_url: url,
        doc_number: options.numbers?.[docKey] ? String(options.numbers[docKey]) : null,
        valid_until: options.expiries?.[docKey] ? String(options.expiries[docKey]) : null,
        status: options.status || 'uploaded',
      })
    }
  },
}
