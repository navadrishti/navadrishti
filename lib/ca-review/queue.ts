import 'server-only'

import { supabase } from '@/lib/db'
import { getCaComplianceTags, getDocumentExpiries, visibleCaBadgeNumber } from '@/lib/auth'
import type { CAQueueType } from '@/lib/ca-review-types'
import { parseJsonObject } from '@/lib/utils'
import { buildCrossDocumentComparisons } from './cross-field-comparisons'
import { extractDocuments } from './documents'
import { applyNgoExpiryOverlay } from './ngo-compliance'
import { effectiveCaQueueStatus, hasLiveVerificationPack, sanitizeCaReviewItem } from './pack-visibility'
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
  const verificationStatus = effectiveCaQueueStatus(row.verification_status, user.verification_status)
  const livePack = hasLiveVerificationPack(verificationStatus)
  const stagedDocs = livePack ? parseJsonObject(typeBlock.reverification_documents) : {}
  const reverifying =
    livePack && (Boolean(profileData.reverification_pending) || Object.keys(stagedDocs).length > 0)
  const staged = reverifying ? nonEmptyValues(typeBlock.reverification_entered_fields) : {}
  const stagedDetails = reverifying ? nonEmptyValues(typeBlock.reverification_details) : {}
  const entered = livePack ? { ...parseJsonObject(typeBlock.entered_fields), ...staged } : {}
  const documents = livePack ? extractDocuments(profileData, profileKey, `${type}-${row.id}`) : []

  const submittedAt = typeBlock.submitted_at || row.updated_at || row.created_at
  const documentExpiries = livePack && type === 'ngos' ? getDocumentExpiries(profileData) : null
  const base = {
    id: row.id,
    user_id: row.user_id,
    email: user.email || '',
    phone: user.phone || '',
    verification_status: verificationStatus,
    ca_badge_number: visibleCaBadgeNumber(verificationStatus, profileData),
    submitted_at: submittedAt,
    documents,
    documents_total: documents.length,
    ocr_error: '',
    reverification_pending: reverifying,
  }

  const mapped =
    type === 'individuals'
      ? {
          ...base,
          name: user.name || '',
          aadhaar: livePack ? row.aadhaar_number || entered.aadhaar || '' : '',
          pan: livePack ? row.pan_number || entered.pan || '' : '',
        }
      : type === 'companies'
        ? {
            ...base,
            company_name: livePack
              ? stagedDetails.company_name || row.company_name || user.name || ''
              : row.company_name || user.name || '',
            business_description: profileData.business_description || user.work_experience || user.industry || '',
            gst: livePack ? staged.gst || row.gst_number || entered.gst || '' : '',
            pan: livePack ? entered.pan || '' : '',
            cin: livePack ? entered.cin || '' : '',
          }
        : {
            ...base,
            ngo_name: livePack
              ? stagedDetails.ngo_name || row.ngo_name || user.name || ''
              : row.ngo_name || user.name || '',
            ngo_description: profileData.ngo_description || user.work_experience || '',
            registration_number: livePack
              ? staged.registration_number || row.registration_number || entered.registration_number || ''
              : '',
            fcra_number: livePack ? staged.fcra_number || row.fcra_number || entered.fcra_number || '' : '',
            fcra_expiry: livePack
              ? entered.fcra_expiry ||
                profileData.fcra_expiry_date ||
                documentExpiries?.fcra?.valid_until ||
                ''
              : '',
            pan: livePack ? entered.pan || '' : '',
            twelve_a: livePack ? staged.twelve_a || profileData.twelve_a_number || entered.twelve_a || '' : '',
            twelve_a_expiry: livePack ? entered.twelve_a_expiry || documentExpiries?.twelve_a?.valid_until || '' : '',
            eighty_g: livePack ? staged.eighty_g || profileData.eighty_g_number || entered.eighty_g || '' : '',
            eighty_g_expiry: livePack ? entered.eighty_g_expiry || documentExpiries?.eighty_g?.valid_until || '' : '',
            csr1: livePack ? staged.csr1 || profileData.csr1_registration_number || entered.csr1 || '' : '',
            csr1_expiry: livePack ? entered.csr1_expiry || documentExpiries?.csr1?.valid_until || '' : '',
            registration_type: livePack ? row.registration_type || entered.registration_type || '' : '',
            allotted_compliance_tags: livePack
              ? getCaComplianceTags(profileData, user.verification_status || row.verification_status)
              : [],
          }

  if (type === 'ngos') {
    const next = livePack
      ? applyNgoExpiryOverlay(mapped, documents, parseJsonObject(typeBlock.ocr_expiries))
      : { ...mapped, field_comparisons: [] }
    return sanitizeCaReviewItem(next)
  }

  return sanitizeCaReviewItem({
    ...mapped,
    field_comparisons: buildCrossDocumentComparisons(type, documents, mapped),
  })
}

function isPendingQueueStatus(status: string) {
  return status === 'pending' || status === 'unverified'
}

async function appendPendingReverifications(
  type: CAQueueType,
  mapped: ReturnType<typeof mapQueueItem>[]
) {
  const { table } = TYPE_CONFIG[type]
  const { data: verifiedRows, error: verifiedError } = await supabase
    .from(table)
    .select(selectColumns(type))
    .eq('verification_status', 'verified')
    .order('updated_at', { ascending: false })
    .limit(200)
  if (verifiedError) {
    console.error(`CA queue query failed for ${type} reverifications:`, verifiedError)
    return mapped
  }

  const pending = ((verifiedRows || []) as unknown as VerificationQueueRow[])
    .map((row) => mapQueueItem(type, row))
    .filter((item) => Boolean(item.reverification_pending))
  const seen = new Set(mapped.map((item) => item.id))
  const next = [...mapped]
  for (const item of pending) {
    if (!seen.has(item.id)) next.push(item)
  }
  return next
}

export async function listCAQueue(type: CAQueueType, status: string) {
  const { table } = TYPE_CONFIG[type]
  let query = supabase.from(table).select(selectColumns(type)).order('updated_at', { ascending: false }).limit(100)
  if (status === 'verified') query = query.eq('verification_status', 'verified')
  else if (isPendingQueueStatus(status)) query = query.eq('verification_status', 'pending')

  const { data, error } = await query

  if (error) {
    console.error(`CA queue query failed for ${table}:`, error)
    throw error
  }

  const mapped = ((data || []) as unknown as VerificationQueueRow[]).map((row) => mapQueueItem(type, row))
  if (isPendingQueueStatus(status)) {
    return appendPendingReverifications(
      type,
      mapped.filter(
        (item) =>
          String(item.verification_status).toLowerCase() === 'pending' || Boolean(item.reverification_pending)
      )
    )
  }
  return mapped
}
