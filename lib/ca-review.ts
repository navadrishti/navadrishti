import 'server-only'

import type { NextRequest } from 'next/server'
import { supabase } from '@/lib/db'
import {
  allotCaComplianceTags,
  buildNgoDocumentExpiries,
  CA_COMPLIANCE_TAG_KEYS,
  getCaComplianceTags,
  getComplianceDocumentUrl,
  getDocumentExpiries,
  listCaComplianceTagOptions,
  normalizeExpiryDate,
  type CaComplianceTagKey,
} from '@/lib/auth'
import { getCAFromRequest } from '@/lib/server-auth'
import { applyCaBadgeToProfile, type PlatformCATokenPayload } from '@/lib/platform-ca-auth'
import { extractVisibleKycFields, isGeminiOcrUnavailable } from '@/lib/gemini-vision'
import {
  approveReverification,
  rejectReverification,
  reverificationDocumentLabels,
} from '@/lib/reverification'
import type { CAFieldComparison, CAFieldComparisonSource, CAQueueType, CAReviewDocument } from '@/lib/ca-review-types'

const TYPE_CONFIG: Record<
  CAQueueType,
  { table: string; profileKey: 'individual' | 'company' | 'ngo' }
> = {
  individuals: { table: 'individual_verifications', profileKey: 'individual' },
  companies: { table: 'company_verifications', profileKey: 'company' },
  ngos: { table: 'ngo_verifications', profileKey: 'ngo' },
}

const MAX_OCR_DOCS = 12

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {}
}

function unwrapUser(value: unknown) {
  if (Array.isArray(value)) return asRecord(value[0])
  return asRecord(value)
}

function compactId(value: string) {
  return value.replace(/[\s-]/g, '').toUpperCase()
}

function collapseText(value: string) {
  return value.replace(/[.,;:'"()#]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase()
}

const NAME_TITLES = new Set(['MR', 'MRS', 'MS', 'SMT', 'SHRI', 'SHREE', 'DR', 'M/S', 'M/S.', 'MESSRS'])
const ADDRESS_STOP = new Set([
  'THE', 'OF', 'AND', 'NEAR', 'OPP', 'OPPOSITE', 'DIST', 'DISTRICT', 'STATE', 'PIN', 'PINCODE',
  'INDIA', 'FLAT', 'FLOOR', 'NO', 'NO.', 'PLOT', 'VILL', 'VILLAGE', 'PO', 'PS', 'TEHSIL',
])

function nameTokens(value: string) {
  return collapseText(value)
    .split(' ')
    .map((token) => token.replace(/\./g, ''))
    .filter((token) => token.length > 1 && !NAME_TITLES.has(token))
}

function namesMatch(a: string, b: string) {
  const left = nameTokens(a)
  const right = nameTokens(b)
  if (left.length === 0 || right.length === 0) return false
  if (left.join(' ') === right.join(' ')) return true
  const shorter = left.length <= right.length ? left : right
  const longer = left.length <= right.length ? right : left
  return shorter.every((token) =>
    longer.some((other) => other === token || other.startsWith(token) || token.startsWith(other))
  )
}

function parseComparableDate(value: string) {
  const trimmed = value.trim()
  const iso = trimmed.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  const dmy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  const parsed = Date.parse(trimmed)
  if (Number.isNaN(parsed)) return collapseText(trimmed)
  const date = new Date(parsed)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function addressTokens(value: string) {
  return collapseText(value)
    .split(' ')
    .filter((token) => token.length > 1 && !ADDRESS_STOP.has(token))
}

function addressesMatch(a: string, b: string) {
  const left = addressTokens(a)
  const right = addressTokens(b)
  if (left.length === 0 || right.length === 0) return false
  const compactA = compactId(a)
  const compactB = compactId(b)
  if (compactA.includes(compactB) || compactB.includes(compactA)) return true
  const setB = new Set(right)
  const overlap = left.filter((token) => setB.has(token)).length
  const smaller = Math.min(left.length, right.length)
  return smaller > 0 && overlap / smaller >= 0.55
}

function valuesMatch(kind: 'name' | 'date' | 'address' | 'id', a: string, b: string) {
  if (kind === 'name') return namesMatch(a, b)
  if (kind === 'date') return parseComparableDate(a) === parseComparableDate(b)
  if (kind === 'address') return addressesMatch(a, b)
  return compactId(a) === compactId(b)
}

type CrossFieldSpec = {
  field: string
  kind: 'name' | 'date' | 'address' | 'id'
  labels: string[]
  enteredKey?: string
  docKeys?: string[]
}

const FORM_INPUT_LABEL = 'Form input'

const INDIVIDUAL_CROSS_FIELDS: CrossFieldSpec[] = [
  { field: 'Name', kind: 'name', labels: ['Full Name', 'Name', 'Account Holder Name'], enteredKey: 'name' },
  { field: 'Date of Birth', kind: 'date', labels: ['Date of Birth'] },
  { field: "Father's Name", kind: 'name', labels: ["Father's Name"] },
  { field: 'Address', kind: 'address', labels: ['Permanent Address', 'Registered Address', 'Address'] },
  { field: 'Aadhaar Number', kind: 'id', labels: ['Aadhaar Number', 'Aadhaar'], enteredKey: 'aadhaar', docKeys: ['individualAadhaar'] },
  { field: 'PAN Number', kind: 'id', labels: ['PAN Number'], enteredKey: 'pan', docKeys: ['individualPanCard'] },
]

const COMPANY_CROSS_FIELDS: CrossFieldSpec[] = [
  { field: 'Name', kind: 'name', labels: ['Company Name', 'Legal Name', 'Organization Name', 'Name', 'Account Holder Name'], enteredKey: 'company_name' },
  { field: 'Address', kind: 'address', labels: ['Registered Office', 'Registered Address', 'Permanent Address', 'Address'] },
  { field: 'Date of Incorporation', kind: 'date', labels: ['Date of Incorporation', 'Date of Registration', 'Date of Birth'] },
  { field: 'PAN Number', kind: 'id', labels: ['PAN Number'], enteredKey: 'pan', docKeys: ['companyPanCard'] },
  { field: 'GSTIN', kind: 'id', labels: ['GSTIN', 'GST Number'], enteredKey: 'gst', docKeys: ['companyGstCertificate'] },
  { field: 'CIN', kind: 'id', labels: ['CIN'], enteredKey: 'cin', docKeys: ['companyIncorporationCertificate'] },
]

const NGO_CROSS_FIELDS: CrossFieldSpec[] = [
  { field: 'Name', kind: 'name', labels: ['Organization Name', 'NGO Name', 'Legal Name', 'Company Name', 'Name', 'Account Holder Name'], enteredKey: 'ngo_name' },
  { field: 'Address', kind: 'address', labels: ['Registered Office', 'Registered Address', 'Permanent Address', 'Address'] },
  { field: 'Date of Registration', kind: 'date', labels: ['Date of Registration', 'Date of Incorporation', 'Date of Birth'] },
  { field: 'PAN Number', kind: 'id', labels: ['PAN Number'], enteredKey: 'pan', docKeys: ['ngoPanCard'] },
  { field: 'Registration Number', kind: 'id', labels: ['Registration Number'], enteredKey: 'registration_number', docKeys: ['ngoRegistrationCertificate'] },
  { field: 'FCRA Number', kind: 'id', labels: ['FCRA Number', 'FCRA'], enteredKey: 'fcra_number', docKeys: ['ngoFcraPhoto'] },
  { field: 'FCRA Expiry', kind: 'date', labels: ['FCRA Expiry', 'Valid Until', 'Valid Till', 'Valid Upto', 'Expiry Date', 'Date of Expiry'], enteredKey: 'fcra_expiry', docKeys: ['ngoFcraPhoto'] },
  { field: '12A Number', kind: 'id', labels: ['12A Number'], enteredKey: 'twelve_a', docKeys: ['ngoTwelveACertificate', 'twelve_a'] },
  { field: '12A Expiry', kind: 'date', labels: ['12A Expiry', 'Valid Until', 'Valid Till', 'Valid Upto', 'Expiry Date', 'Date of Expiry'], enteredKey: 'twelve_a_expiry', docKeys: ['ngoTwelveACertificate', 'twelve_a'] },
  { field: '80G Number', kind: 'id', labels: ['80G Number'], enteredKey: 'eighty_g', docKeys: ['ngoEightyGCertificate', 'eighty_g'] },
  { field: '80G Expiry', kind: 'date', labels: ['80G Expiry', 'Valid Until', 'Valid Till', 'Valid Upto', 'Expiry Date', 'Date of Expiry'], enteredKey: 'eighty_g_expiry', docKeys: ['ngoEightyGCertificate', 'eighty_g'] },
  { field: 'CSR-1 Registration Number', kind: 'id', labels: ['CSR-1 Registration Number', 'CSR-1 Number'], enteredKey: 'csr1', docKeys: ['ngoCsr1Certificate', 'csr1'] },
  { field: 'CSR-1 Expiry', kind: 'date', labels: ['CSR-1 Expiry', 'Valid Until', 'Valid Till', 'Valid Upto', 'Expiry Date', 'Date of Expiry'], enteredKey: 'csr1_expiry', docKeys: ['ngoCsr1Certificate', 'csr1'] },
]

function pickDocField(doc: CAReviewDocument, labels: string[]) {
  const wanted = labels.map((label) => compactId(label))
  for (const label of wanted) {
    const field = doc.ocr_fields.find((entry) => compactId(entry.label) === label && entry.value?.trim())
    if (field) return field.value.trim()
  }
  return ''
}

function pickCanonicalValue(kind: CrossFieldSpec['kind'], values: string[]) {
  if (values.length === 0) return ''
  if (values.length === 1) return values[0]

  let best = values[0]
  let bestCount = 0
  for (const candidate of values) {
    const count = values.filter((value) => valuesMatch(kind, candidate, value)).length
    if (count > bestCount) {
      best = candidate
      bestCount = count
    }
  }
  return best
}

function buildCrossDocumentComparisons(
  type: CAQueueType,
  documents: CAReviewDocument[],
  item: Record<string, any> = {}
): CAFieldComparison[] {
  const specs =
    type === 'individuals' ? INDIVIDUAL_CROSS_FIELDS : type === 'companies' ? COMPANY_CROSS_FIELDS : NGO_CROSS_FIELDS

  return specs.map((spec) => {
    const enteredValue = spec.enteredKey ? String(item[spec.enteredKey] || '').trim() : ''
    const sources: CAFieldComparisonSource[] = []

    if (spec.enteredKey) {
      sources.push({
        document: FORM_INPUT_LABEL,
        value: enteredValue,
        origin: 'input',
        deviation: false,
      })
    }

    for (const doc of documents) {
      if (spec.docKeys && spec.docKeys.length > 0 && !spec.docKeys.includes(doc.key)) continue
      sources.push({
        document: doc.label,
        value: pickDocField(doc, spec.labels),
        origin: 'document',
        deviation: false,
      })
    }

    const filled = sources.filter((source) => source.value.trim())
    const documentValues = filled.filter((source) => source.origin === 'document').map((source) => source.value)
    const canonical = pickCanonicalValue(
      spec.kind,
      documentValues.length > 0 ? documentValues : filled.map((source) => source.value)
    )

    const marked = sources.map((source) => ({
      ...source,
      deviation: Boolean(source.value.trim() && canonical && !valuesMatch(spec.kind, source.value, canonical)),
    }))
    const deviations = marked.filter((source) => source.deviation).map((source) => source.document)
    const match = filled.length >= 2 && deviations.length === 0

    return {
      field: spec.field,
      sources: marked,
      match,
      status: filled.length < 2 ? 'incomplete' : match ? 'match' : 'mismatch',
      deviations,
    } satisfies CAFieldComparison
  })
}


function fileNameFromUrl(url: string, fallback: string) {
  try {
    const path = new URL(url).pathname
    const name = decodeURIComponent(path.split('/').pop() || '')
    return name || fallback
  } catch {
    return fallback
  }
}

function isImageUrl(url: string) {
  return /\.(png|jpe?g|webp|gif)$/i.test(url) || url.includes('/image/upload')
}

function documentLabel(key: string) {
  return reverificationDocumentLabels[key] || key.replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' ').trim()
}

function documentsFromMap(map: Record<string, unknown>, prefix: string): CAReviewDocument[] {
  return Object.entries(map)
    .map(([key, value]) => {
      const fileUrl = getComplianceDocumentUrl(value)
      if (!/^https?:\/\//i.test(fileUrl)) return null
      return {
        id: `${prefix}-${key}`,
        key,
        label: documentLabel(key),
        file_name: fileNameFromUrl(fileUrl, `${key}.pdf`),
        file_url: fileUrl,
        is_image: isImageUrl(fileUrl),
        ocr_fields: [],
        ocr_status: 'pending' as const,
      }
    })
    .filter((doc): doc is NonNullable<typeof doc> => doc != null)
}

function overlayDocuments(base: CAReviewDocument[], extra: CAReviewDocument[]): CAReviewDocument[] {
  const next = [...base]
  for (const doc of extra) {
    const idx = next.findIndex((item) => item.key === doc.key || item.file_url === doc.file_url)
    const labeled = { ...doc, label: `${doc.label} (updated)` }
    if (idx >= 0) next[idx] = labeled
    else next.push(labeled)
  }
  return next
}

const OCR_EXPIRY_LABELS = [
  'Valid Until',
  'Valid Till',
  'Valid Upto',
  'Expiry Date',
  'Date of Expiry',
  'FCRA Expiry',
  '12A Expiry',
  '80G Expiry',
  'CSR-1 Expiry',
]

const CERT_DOC_KEYS: Record<CaComplianceTagKey, string[]> = {
  twelve_a: ['ngoTwelveACertificate', 'twelve_a'],
  eighty_g: ['ngoEightyGCertificate', 'eighty_g'],
  csr1: ['ngoCsr1Certificate', 'csr1'],
  fcra: ['ngoFcraPhoto', 'fcra'],
}

function pickOcrExpiryDate(doc: CAReviewDocument) {
  return normalizeExpiryDate(pickDocField(doc, OCR_EXPIRY_LABELS))
}

function ngoOcrExpiries(documents: CAReviewDocument[]) {
  const result: Partial<Record<CaComplianceTagKey, string>> = {}
  for (const key of CA_COMPLIANCE_TAG_KEYS) {
    const doc = documents.find((item) => CERT_DOC_KEYS[key].includes(item.key))
    if (!doc) continue
    const expiry = pickOcrExpiryDate(doc)
    if (expiry) result[key] = expiry
  }
  return result
}

function ngoTagOptionsFromItem(item: Record<string, any>, documents: CAReviewDocument[]) {
  return listCaComplianceTagOptions({
    numbers: {
      twelve_a: item.twelve_a,
      eighty_g: item.eighty_g,
      csr1: item.csr1,
      fcra: item.fcra_number,
    },
    expiries: {
      twelve_a: item.twelve_a_expiry,
      eighty_g: item.eighty_g_expiry,
      csr1: item.csr1_expiry,
      fcra: item.fcra_expiry,
    },
    documentsPresent: {
      twelve_a: documents.some((doc) => CERT_DOC_KEYS.twelve_a.includes(doc.key)),
      eighty_g: documents.some((doc) => CERT_DOC_KEYS.eighty_g.includes(doc.key)),
      csr1: documents.some((doc) => CERT_DOC_KEYS.csr1.includes(doc.key)),
      fcra: documents.some((doc) => CERT_DOC_KEYS.fcra.includes(doc.key)),
    },
  })
}

function applyNgoExpiryOverlay(
  item: Record<string, any>,
  documents: CAReviewDocument[],
  persistedOcrExpiries?: Record<string, unknown>
): Record<string, any> {
  const merged = {
    ...asRecord(persistedOcrExpiries),
    ...ngoOcrExpiries(documents),
  }
  const next = {
    ...item,
    twelve_a_expiry: merged.twelve_a || item.twelve_a_expiry,
    eighty_g_expiry: merged.eighty_g || item.eighty_g_expiry,
    csr1_expiry: merged.csr1 || item.csr1_expiry,
    fcra_expiry: merged.fcra || item.fcra_expiry,
    ocr_expiries: merged,
  }
  return {
    ...next,
    field_comparisons: buildCrossDocumentComparisons('ngos', documents, next),
    compliance_tag_options: ngoTagOptionsFromItem(next, documents),
  }
}

function extractDocuments(profileData: Record<string, any>, profileKey: string, prefix: string): CAReviewDocument[] {
  const verificationDocuments = asRecord(profileData.verification_documents)
  const typeBlock = asRecord(verificationDocuments[profileKey])
  const docs = documentsFromMap(asRecord(typeBlock.documents), prefix)

  if (profileKey === 'ngo') {
    const compliance = asRecord(profileData.compliance_documents)
    const extra = documentsFromMap(
      {
        twelve_a: compliance.twelve_a,
        eighty_g: compliance.eighty_g,
        csr1: compliance.csr1,
      },
      `${prefix}-compliance`
    )
    const seen = new Set(docs.map((doc) => doc.file_url))
    for (const doc of extra) {
      if (!seen.has(doc.file_url)) docs.push(doc)
    }

    return overlayDocuments(docs, [
      ...documentsFromMap(asRecord(typeBlock.reverification_documents), `${prefix}-reverify`),
      ...documentsFromMap(asRecord(compliance.pending_reverification), `${prefix}-pending-compliance`),
    ])
  }

  return docs
}

function mapQueueItem(type: CAQueueType, row: any): Record<string, any> {
  const user = unwrapUser(row.users)
  const profileData = asRecord(user.profile_data)
  const profileKey = TYPE_CONFIG[type].profileKey
  const typeBlock = asRecord(asRecord(profileData.verification_documents)[profileKey])
  const entered = asRecord(typeBlock.entered_fields)
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
    documents_verified: 0,
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
            company_name: row.company_name || user.name || '',
            business_description: profileData.business_description || user.work_experience || user.industry || '',
            gst: row.gst_number || entered.gst || '',
            pan: entered.pan || '',
            cin: entered.cin || '',
          }
        : {
            ...base,
            ngo_name: row.ngo_name || user.name || '',
            ngo_description: profileData.ngo_description || user.work_experience || '',
            registration_number: row.registration_number || entered.registration_number || '',
            fcra_number: row.fcra_number || entered.fcra_number || '',
            fcra_expiry:
              entered.fcra_expiry ||
              profileData.fcra_expiry_date ||
              documentExpiries?.fcra?.valid_until ||
              '',
            pan: entered.pan || '',
            twelve_a: profileData.twelve_a_number || entered.twelve_a || '',
            twelve_a_expiry: entered.twelve_a_expiry || documentExpiries?.twelve_a?.valid_until || '',
            eighty_g: profileData.eighty_g_number || entered.eighty_g || '',
            eighty_g_expiry: entered.eighty_g_expiry || documentExpiries?.eighty_g?.valid_until || '',
            csr1: profileData.csr1_registration_number || entered.csr1 || '',
            csr1_expiry: entered.csr1_expiry || documentExpiries?.csr1?.valid_until || '',
            reverification_pending: Boolean(profileData.reverification_pending),
            allotted_compliance_tags: getCaComplianceTags(
              profileData,
              user.verification_status || row.verification_status
            ),
          }

  if (type === 'ngos') {
    return applyNgoExpiryOverlay(mapped, documents, asRecord(typeBlock.ocr_expiries))
  }

  return {
    ...mapped,
    field_comparisons: buildCrossDocumentComparisons(type, documents, mapped),
  }
}

function hasReviewableSubmission(item: ReturnType<typeof mapQueueItem>) {
  if ((item as { reverification_pending?: boolean }).reverification_pending) return true
  if (item.verification_status === 'pending') return true
  return item.documents_total > 0
}

const USER_SELECT = 'users ( id, name, email, phone, work_experience, industry, profile_image, profile_data, verification_status )'

function selectColumns(type: CAQueueType) {
  if (type === 'individuals') {
    return `
      id, user_id, verification_status, aadhaar_number, pan_number, verification_date, created_at, updated_at,
      ${USER_SELECT}
    `
  }
  if (type === 'companies') {
    return `
      id, user_id, verification_status, company_name, gst_number, registration_number, sector, verification_date, created_at, updated_at,
      ${USER_SELECT}
    `
  }
  return `
    id, user_id, verification_status, ngo_name, registration_number, registration_type, fcra_number, sector, verification_date, created_at, updated_at,
    ${USER_SELECT}
  `
}

export function requireCA(request: NextRequest): PlatformCATokenPayload {
  const ca = getCAFromRequest(request)
  if (!ca) {
    throw new Error('CA authentication required')
  }
  return ca
}

export async function listCAQueue(type: CAQueueType, status: string) {
  const { table } = TYPE_CONFIG[type]
  const applyStatus = (query: any) => {
    if (status === 'verified') return query.eq('verification_status', 'verified')
    if (status === 'unverified') return query.in('verification_status', ['pending', 'unverified'])
    return query
  }

  let { data, error } = await applyStatus(
    supabase.from(table).select(selectColumns(type)).order('updated_at', { ascending: false }).limit(100)
  )

  if (error) {
    console.error(`CA queue query failed for ${table}:`, error)
    throw error
  }

  let mapped = (data || []).map((row: any) => mapQueueItem(type, row))
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
        const pending = (verifiedRows || [])
          .map((row: any) => mapQueueItem(type, row))
          .filter((item: ReturnType<typeof mapQueueItem>) =>
            Boolean((item as { reverification_pending?: boolean }).reverification_pending)
          )
        const seen = new Set(mapped.map((item: { id: number }) => item.id))
        for (const item of pending) {
          if (!seen.has(item.id)) mapped.push(item)
        }
      }
    }
    return mapped
  }
  return mapped
}

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

async function applyOcr(type: CAQueueType, row: any, item: ReturnType<typeof mapQueueItem>) {
  const user = unwrapUser(row.users)
  const profileData = asRecord(user.profile_data)
  const profileKey = TYPE_CONFIG[type].profileKey
  const verificationDocuments = asRecord(profileData.verification_documents)
  const typeBlock = asRecord(verificationDocuments[profileKey])
  const cache = asRecord(typeBlock.ocr_cache)

  const documents = item.documents.slice(0, MAX_OCR_DOCS)
  const nextDocs: CAReviewDocument[] = []
  let cacheChanged = false
  let serviceDown = false
  const missingKey = !process.env.GEMINI_API_KEY

  for (const doc of documents) {
    const cacheKey = `${doc.file_url}::gemini-verbatim-v5`
    const cached = asRecord(cache[cacheKey])
    if (Array.isArray(cached.fields) && cached.fields.length > 0) {
      nextDocs.push({
        ...doc,
        ocr_fields: cached.fields,
        ocr_status: 'completed',
      })
      continue
    }

    if (missingKey || serviceDown) {
      nextDocs.push({ ...doc, ocr_status: 'skipped' })
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
  const nextOcrExpiries = { ...asRecord(typeBlock.ocr_expiries), ...ocrExpiries }
  const expiriesChanged =
    type === 'ngos' && JSON.stringify(asRecord(typeBlock.ocr_expiries)) !== JSON.stringify(nextOcrExpiries)
  const nextTypeBlock = {
    ...typeBlock,
    ocr_cache: cache,
    ...(type === 'ngos' ? { ocr_expiries: nextOcrExpiries } : {}),
  }

  if ((cacheChanged || expiriesChanged) && user.id) {
    await supabase
      .from('users')
      .update({
        profile_data: {
          ...profileData,
          verification_documents: {
            ...verificationDocuments,
            [profileKey]: nextTypeBlock,
          },
        },
      })
      .eq('id', user.id)
  }

  const ocrError = missingKey
    ? 'Document reading is not configured.'
    : serviceDown
      ? 'Document reading is unavailable right now. Open the files and compare them manually.'
      : nextDocs.some((doc) => doc.ocr_status === 'failed')
        ? 'Some documents could not be read. Open them and compare manually.'
        : ''

  const withDocs = {
    ...item,
    documents: nextDocs,
    documents_total: nextDocs.length,
    field_comparisons: buildCrossDocumentComparisons(type, nextDocs, item),
    ocr_error: ocrError,
  }

  if (type !== 'ngos') return withDocs
  return applyNgoExpiryOverlay(withDocs, nextDocs, asRecord(nextTypeBlock.ocr_expiries))
}

export async function getCAReview(type: CAQueueType, id: number) {
  const { table } = TYPE_CONFIG[type]
  const { data, error } = await supabase.from(table).select(selectColumns(type)).eq('id', id).single()

  if (error || !data) {
    throw new Error('Verification record not found')
  }
  return applyOcr(type, data, mapQueueItem(type, data))
}

async function notifyUser(userId: number, title: string, message: string) {
  const { error } = await supabase.from('user_notifications').insert({
    user_id: userId,
    type: 'verification',
    title,
    message,
    action_url: '/verification',
  })
  if (error) {
    console.error('Failed to notify user about verification decision:', error)
  }
}

export async function applyCAVerificationAction(options: {
  type: CAQueueType
  id: number
  action: 'approve' | 'reject'
  reason?: string
  compliance_tags?: unknown
  ca: PlatformCATokenPayload
}) {
  const { type, id, action, reason, compliance_tags, ca } = options
  const { table, profileKey } = TYPE_CONFIG[type]
  const reviewedAt = new Date().toISOString()

  const rowSelect =
    type === 'companies'
      ? 'id, user_id, company_name'
      : type === 'ngos'
        ? 'id, user_id, ngo_name'
        : 'id, user_id'

  type VerificationActionRow = {
    id: number
    user_id: number
    company_name?: string
    ngo_name?: string
  }

  const { data: rowData, error: fetchError } = await supabase
    .from(table)
    .select(rowSelect)
    .eq('id', id)
    .single()

  if (fetchError || !rowData) {
    throw new Error('Verification record not found')
  }

  const row = rowData as unknown as VerificationActionRow

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, name, profile_data, verification_status')
    .eq('id', row.user_id)
    .single()

  if (userError || !user) {
    throw new Error('User not found')
  }

  const profileData = asRecord(user.profile_data)
  const isReverification = type === 'ngos' && Boolean(profileData.reverification_pending)
  if (String(user.verification_status || '').toLowerCase() === 'verified' && !isReverification) {
    throw new Error('This record is already verified. Tags and decisions cannot be changed.')
  }
  const rowRecord = asRecord(row)
  const stakeholderName =
    (type === 'companies'
      ? String(rowRecord.company_name || user.name || '').trim()
      : type === 'ngos'
        ? String(rowRecord.ngo_name || user.name || '').trim()
        : String(user.name || '').trim()) ||
    (type === 'companies' ? 'Company' : type === 'ngos' ? 'NGO' : 'Individual')
  const reviewer = ca.display_name || ca.username

  if (isReverification) {
    if (action === 'reject') {
      await rejectReverification(row.user_id, reason || '', reviewer)
      await notifyUser(
        row.user_id,
        'Reverification rejected',
        `Your updated certificates were not accepted. ${reason || 'Please resubmit clearer matching documents.'} You stay CA-verified.`
      )
      return {
        success: true,
        message: `${stakeholderName} reverification rejected. Organization stays CA-verified.`,
      }
    }

    const approved = await approveReverification(row.user_id, reviewer, compliance_tags)
    await notifyUser(
      row.user_id,
      'Reverification approved',
      'Your updated certificates were reviewed. Matching CA tags were re-allotted. You stay CA-verified.'
    )
    return {
      success: true,
      message: `${stakeholderName} reverification approved. CA tags re-allotted.`,
      user: approved,
    }
  }

  const nextStatus = action === 'approve' ? 'verified' : 'rejected'
  const userStatus = action === 'approve' ? 'verified' : 'unverified'
  const verificationUpdate: Record<string, any> = {
    verification_status: nextStatus,
    updated_at: reviewedAt,
  }

  if (action === 'approve') {
    if (type === 'individuals') {
      verificationUpdate.aadhaar_verified = true
      verificationUpdate.pan_verified = true
      verificationUpdate.aadhaar_verified_at = reviewedAt
      verificationUpdate.pan_verified_at = reviewedAt
    }
    verificationUpdate.verification_date = reviewedAt
  }

  const { error: verificationError } = await supabase.from(table).update(verificationUpdate).eq('id', id)
  if (verificationError) {
    if (nextStatus === 'rejected') {
      const { error: fallbackError } = await supabase
        .from(table)
        .update({ verification_status: 'unverified', updated_at: reviewedAt })
        .eq('id', id)
      if (fallbackError) throw verificationError
    } else {
      throw verificationError
    }
  }

  const verificationDocuments = asRecord(profileData.verification_documents)
  const typeBlock = asRecord(verificationDocuments[profileKey])
  const ocrExpiries = asRecord(typeBlock.ocr_expiries)
  const entered = {
    ...asRecord(typeBlock.entered_fields),
    ...(ocrExpiries.twelve_a ? { twelve_a_expiry: ocrExpiries.twelve_a } : {}),
    ...(ocrExpiries.eighty_g ? { eighty_g_expiry: ocrExpiries.eighty_g } : {}),
    ...(ocrExpiries.csr1 ? { csr1_expiry: ocrExpiries.csr1 } : {}),
    ...(ocrExpiries.fcra ? { fcra_expiry: ocrExpiries.fcra } : {}),
  }

  let nextProfileData: Record<string, any> = {
    ...profileData,
    verification_documents: {
      ...verificationDocuments,
      [profileKey]: {
        ...typeBlock,
        entered_fields: entered,
        status: nextStatus,
        reviewed_at: reviewedAt,
        reviewed_by: reviewer,
        rejection_reason: action === 'reject' ? reason || '' : null,
      },
    },
  }

  if (action === 'approve' && type === 'ngos') {
    const docs = asRecord(typeBlock.documents)
    nextProfileData = {
      ...nextProfileData,
      fcra_expiry_date: entered.fcra_expiry || nextProfileData.fcra_expiry_date || null,
      document_expiries: buildNgoDocumentExpiries({
        profileData: nextProfileData,
        enteredFields: entered,
        documents: docs,
        submittedAt: typeBlock.submitted_at || reviewedAt,
      }),
      document_expiry_unverified_at: null,
      document_expiry_unverified_docs: null,
    }
    nextProfileData = allotCaComplianceTags(nextProfileData, compliance_tags).profileData
  }

  let caBadgeNumber: string | null = null
  if (action === 'approve') {
    const attached = applyCaBadgeToProfile(nextProfileData, row.user_id, {
      verifiedAt: reviewedAt,
      verifiedBy: ca.display_name || ca.username,
    })
    nextProfileData = attached.profileData
    caBadgeNumber = attached.badge
  }

  const userUpdate: Record<string, any> = {
    verification_status: userStatus,
    profile_data: nextProfileData,
    updated_at: reviewedAt,
  }

  if (action === 'approve') {
    userUpdate.verified_at = reviewedAt
    userUpdate.verification_level = 'advanced'
  }

  const { error: userUpdateError } = await supabase.from('users').update(userUpdate).eq('id', row.user_id)
  if (userUpdateError) throw userUpdateError

  const message =
    action === 'approve' && caBadgeNumber
      ? `${stakeholderName} approved. CA badge ${caBadgeNumber}`
      : `${stakeholderName} ${action === 'approve' ? 'approved' : 'rejected'}`

  await notifyUser(
    row.user_id,
    action === 'approve' ? 'Verification approved' : 'Verification rejected',
    action === 'approve'
      ? `Your documents have been CA-verified. Your badge number is ${caBadgeNumber}.`
      : `Your verification was rejected. ${reason || 'Please resubmit clearer matching documents.'}`
  )

  return {
    entity_type: type,
    entity_id: id,
    user_id: row.user_id,
    action,
    status: nextStatus,
    reviewed_at: reviewedAt,
    reviewed_by: ca.display_name || ca.username,
    stakeholder_name: stakeholderName,
    ca_badge_number: caBadgeNumber,
    message,
  }
}
