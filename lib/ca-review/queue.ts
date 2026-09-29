import 'server-only'

import { supabase } from '@/lib/db'
import { getCaComplianceTags, getDocumentExpiries } from '@/lib/auth'
import type { CAQueueType } from '@/lib/ca-review-types'
import { parseJsonObject } from '@/lib/utils'
import { buildCrossDocumentComparisons } from './cross-field-comparisons'
import { extractDocuments } from './documents'
import { applyNgoExpiryOverlay } from './ngo-compliance'
import {
  selectColumns,
  TYPE_CONFIG,
  unwrapUser,
  type CAQueueItem,
  type VerificationQueueRow,
} from './queue-config'

function nonEmptyValues(value: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(parseJsonObject(value)).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim().length > 0
    )
  )
}

export function mapQueueItem(type: CAQueueType, row: VerificationQueueRow): CAQueueItem {
  const user = unwrapUser(row.users)
  const profileData = parseJsonObject(user.profile_data)
  const profileKey = TYPE_CONFIG[type].profileKey
  const typeBlock = parseJsonObject(parseJsonObject(profileData.verification_documents)[profileKey])
  const reverifying = Boolean(profileData.reverification_pending)
  const staged = reverifying ? nonEmptyValues(typeBlock.reverification_entered_fields) : {}
  const stagedDetails = reverifying ? nonEmptyValues(typeBlock.reverification_details) : {}
  const entered = { ...parseJsonObject(typeBlock.entered_fields), ...staged }
  const documents = extractDocuments(profileData, profileKey, `${type}-${row.id}`)

  const submittedAt = typeBlock.submitted_at || row.updated_at || row.created_at
  const documentExpiries = type === 'ngos' ? getDocumentExpiries(profileData) : null
  const base = {
    id: row.id,
    user_id: row.user_id,
    email: user.email || '',
    phone: user.phone || '',
    verification_status: row.verification_status || user.verification_status || 'unverified',
    submitted_at: submittedAt,
    documents,
    documents_total: documents.length,
    ocr_error: '',
  }

  const mapped =
    type === 'individuals'
      ? {
          ...base,
          name: user.name || '',
          aadhaar: row.aadhaar_number || entered.aadhaar || '',
          pan: row.pan_number || entered.pan || '',
        }
      : type === 'companies'
        ? {
            ...base,
            company_name: stagedDetails.company_name || row.company_name || user.name || '',
            business_description: profileData.business_description || user.work_experience || user.industry || '',
            gst: staged.gst || row.gst_number || entered.gst || '',
            pan: entered.pan || '',
            cin: entered.cin || '',
          }
        : {
            ...base,
            ngo_name: stagedDetails.ngo_name || row.ngo_name || user.name || '',
            ngo_description: profileData.ngo_description || user.work_experience || '',
            registration_number: staged.registration_number || row.registration_number || entered.registration_number || '',
            fcra_number: staged.fcra_number || row.fcra_number || entered.fcra_number || '',
            fcra_expiry:
              entered.fcra_expiry ||
              profileData.fcra_expiry_date ||
              documentExpiries?.fcra?.valid_until ||
              '',
            pan: entered.pan || '',
            twelve_a: staged.twelve_a || profileData.twelve_a_number || entered.twelve_a || '',
            twelve_a_expiry: entered.twelve_a_expiry || documentExpiries?.twelve_a?.valid_until || '',
            eighty_g: staged.eighty_g || profileData.eighty_g_number || entered.eighty_g || '',
            eighty_g_expiry: entered.eighty_g_expiry || documentExpiries?.eighty_g?.valid_until || '',
            csr1: staged.csr1 || profileData.csr1_registration_number || entered.csr1 || '',
            csr1_expiry: entered.csr1_expiry || documentExpiries?.csr1?.valid_until || '',
            reverification_pending: Boolean(profileData.reverification_pending),
            allotted_compliance_tags: getCaComplianceTags(
              profileData,
              user.verification_status || row.verification_status
            ),
          }

  if (type === 'ngos') {
    return applyNgoExpiryOverlay(mapped, documents, parseJsonObject(typeBlock.ocr_expiries))
  }

  return {
    ...mapped,
    field_comparisons: buildCrossDocumentComparisons(type, documents, mapped),
  }
}

function hasReviewableSubmission(item: CAQueueItem) {
  if (item.reverification_pending) return true
  if (item.verification_status === 'pending') return true
  return item.documents_total > 0
}

export async function listCAQueue(type: CAQueueType, status: string) {
  const { table } = TYPE_CONFIG[type]
  let query = supabase.from(table).select(selectColumns(type)).order('updated_at', { ascending: false }).limit(100)
  if (status === 'verified') query = query.eq('verification_status', 'verified')
  else if (status === 'unverified') query = query.in('verification_status', ['pending', 'unverified'])

  const { data, error } = await query

  if (error) {
    console.error(`CA queue query failed for ${table}:`, error)
    throw error
  }

  let mapped = ((data || []) as unknown as VerificationQueueRow[]).map((row) => mapQueueItem(type, row))
  if (status === 'unverified') {
    mapped = mapped.filter(hasReviewableSubmission)
    if (type === 'ngos') {
      const { data: verifiedRows, error: verifiedError } = await supabase
        .from(table)
        .select(selectColumns(type))
        .eq('verification_status', 'verified')
        .order('updated_at', { ascending: false })
        .limit(200)
      if (verifiedError) {
        console.error('CA queue query failed for NGO reverifications:', verifiedError)
      } else {
        const pending = ((verifiedRows || []) as unknown as VerificationQueueRow[])
          .map((row) => mapQueueItem(type, row))
          .filter((item) => Boolean(item.reverification_pending))
        const seen = new Set(mapped.map((item) => item.id))
        for (const item of pending) {
          if (!seen.has(item.id)) mapped.push(item)
        }
      }
    }
    return mapped
  }
  return mapped
}
