import 'server-only'

import { supabase } from '@/lib/db'
import { extractVisibleKycFields, isGeminiOcrUnavailable } from '@/lib/gemini-vision'
import type { CAQueueType, CAReviewDocument } from '@/lib/ca-review-types'
import { parseJsonObject } from '@/lib/utils'
import { buildCrossDocumentComparisons } from './cross-field-comparisons'
import { isTrustedDocumentUrl } from './document-urls'
import { CAReviewError } from './errors'
import { applyNgoExpiryOverlay, ngoOcrExpiries } from './ngo-compliance'
import { mapQueueItem } from './queue'
import {
  selectColumns,
  TYPE_CONFIG,
  unwrapUser,
  type CAQueueItem,
  type VerificationQueueRow,
} from './queue-config'

const MAX_OCR_DOCS = 12

async function ocrDocument(doc: CAReviewDocument): Promise<CAReviewDocument> {
  try {
    const ocr_fields = await extractVisibleKycFields({
      label: doc.label,
      fileName: doc.file_name,
      fileUrl: doc.file_url,
    })
    return { ...doc, ocr_fields, ocr_status: 'completed' }
  } catch (error) {
    if (isGeminiOcrUnavailable(error)) throw error
    console.error(`OCR failed for ${doc.file_url}:`, error)
    return { ...doc, ocr_fields: [], ocr_status: 'failed' }
  }
}

// OCR can take a long time, so merge into the latest profile_data instead of the copy read before it.
async function saveOcrResults(
  userId: number,
  profileKey: string,
  cache: Record<string, unknown>,
  ocrExpiries: Record<string, unknown> | null
) {
  const { data: latest, error: readError } = await supabase
    .from('users')
    .select('profile_data')
    .eq('id', userId)
    .maybeSingle()
  if (readError || !latest) {
    console.error('Failed to reload profile before caching OCR results:', readError)
    return
  }

  const profileData = parseJsonObject(latest.profile_data)
  const verificationDocuments = parseJsonObject(profileData.verification_documents)
  const typeBlock = parseJsonObject(verificationDocuments[profileKey])
  const { error } = await supabase
    .from('users')
    .update({
      profile_data: {
        ...profileData,
        verification_documents: {
          ...verificationDocuments,
          [profileKey]: {
            ...typeBlock,
            ocr_cache: { ...parseJsonObject(typeBlock.ocr_cache), ...cache },
            ...(ocrExpiries ? { ocr_expiries: { ...parseJsonObject(typeBlock.ocr_expiries), ...ocrExpiries } } : {}),
          },
        },
      },
    })
    .eq('id', userId)
  if (error) console.error('Failed to cache OCR results:', error)
}

async function applyOcr(type: CAQueueType, row: VerificationQueueRow, item: CAQueueItem) {
  const user = unwrapUser(row.users)
  const profileData = parseJsonObject(user.profile_data)
  const profileKey = TYPE_CONFIG[type].profileKey
  const verificationDocuments = parseJsonObject(profileData.verification_documents)
  const typeBlock = parseJsonObject(verificationDocuments[profileKey])
  const cache = parseJsonObject(typeBlock.ocr_cache)

  const nextDocs: CAReviewDocument[] = []
  let cacheChanged = false
  let serviceDown = false
  let overLimit = false
  const missingKey = !process.env.GEMINI_API_KEY

  for (const [index, doc] of item.documents.entries()) {
    const cacheKey = `${doc.file_url}::gemini-verbatim-v5`
    const cached = parseJsonObject(cache[cacheKey])
    if (Array.isArray(cached.fields) && cached.fields.length > 0) {
      nextDocs.push({
        ...doc,
        ocr_fields: cached.fields,
        ocr_status: 'completed',
      })
      continue
    }

    if (missingKey || serviceDown || !isTrustedDocumentUrl(doc.file_url)) {
      nextDocs.push({ ...doc, ocr_status: 'skipped' })
      continue
    }

    if (index >= MAX_OCR_DOCS) {
      overLimit = true
      nextDocs.push({ ...doc, ocr_fields: [], ocr_status: 'skipped' })
      continue
    }

    try {
      const ocrDoc = await ocrDocument(doc)
      nextDocs.push(ocrDoc)
      if (ocrDoc.ocr_status === 'completed' && ocrDoc.ocr_fields.length > 0) {
        cache[cacheKey] = { fields: ocrDoc.ocr_fields, at: new Date().toISOString() }
        cacheChanged = true
      }
    } catch (error) {
      serviceDown = isGeminiOcrUnavailable(error)
      console.error(`OCR failed for ${doc.file_url}:`, error)
      nextDocs.push({ ...doc, ocr_fields: [], ocr_status: serviceDown ? 'skipped' : 'failed' })
    }
  }

  const ocrExpiries = type === 'ngos' ? ngoOcrExpiries(nextDocs) : {}
  const nextOcrExpiries = { ...parseJsonObject(typeBlock.ocr_expiries), ...ocrExpiries }
  const expiriesChanged =
    type === 'ngos' && JSON.stringify(parseJsonObject(typeBlock.ocr_expiries)) !== JSON.stringify(nextOcrExpiries)
  const nextTypeBlock = {
    ...typeBlock,
    ocr_cache: cache,
    ...(type === 'ngos' ? { ocr_expiries: nextOcrExpiries } : {}),
  }

  if ((cacheChanged || expiriesChanged) && user.id) {
    await saveOcrResults(user.id, profileKey, cache, type === 'ngos' ? ocrExpiries : null)
  }

  const ocrError = missingKey
    ? 'Document reading is not configured.'
    : serviceDown
      ? 'Document reading is unavailable right now. Open the files and compare them manually.'
      : nextDocs.some((doc) => doc.ocr_status === 'failed')
        ? 'Some documents could not be read. Open them and compare manually.'
        : overLimit
          ? `Only the first ${MAX_OCR_DOCS} documents were read automatically. Open the rest and compare manually.`
          : ''

  const withDocs = {
    ...item,
    documents: nextDocs,
    documents_total: nextDocs.length,
    field_comparisons: buildCrossDocumentComparisons(type, nextDocs, item),
    ocr_error: ocrError,
  }

  if (type !== 'ngos') return withDocs
  return applyNgoExpiryOverlay(withDocs, nextDocs, parseJsonObject(nextTypeBlock.ocr_expiries))
}

export async function getCAReview(type: CAQueueType, id: number) {
  const { table } = TYPE_CONFIG[type]
  const { data, error } = await supabase.from(table).select(selectColumns(type)).eq('id', id).single()

  if (error || !data) {
    throw new CAReviewError('Verification record not found', 404)
  }
  const row = data as unknown as VerificationQueueRow
  return applyOcr(type, row, mapQueueItem(type, row))
}
