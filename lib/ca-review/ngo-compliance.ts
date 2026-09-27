import {
  CA_COMPLIANCE_TAG_KEYS,
  listCaComplianceTagOptions,
  normalizeExpiryDate,
  type CaComplianceTagKey,
} from '@/lib/auth'
import type { CAReviewDocument } from '@/lib/ca-review-types'
import { parseJsonObject } from '@/lib/utils'
import { buildCrossDocumentComparisons, pickDocField } from './cross-field-comparisons'
import type { CAQueueItem } from './queue-config'

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

export function ngoOcrExpiries(documents: CAReviewDocument[]) {
  const result: Partial<Record<CaComplianceTagKey, string>> = {}
  for (const key of CA_COMPLIANCE_TAG_KEYS) {
    const doc = documents.find((item) => CERT_DOC_KEYS[key].includes(item.key))
    if (!doc) continue
    const expiry = pickOcrExpiryDate(doc)
    if (expiry) result[key] = expiry
  }
  return result
}

function ngoTagOptionsFromItem(item: Record<string, unknown>, documents: CAReviewDocument[]) {
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

export function applyNgoExpiryOverlay(
  item: CAQueueItem,
  documents: CAReviewDocument[],
  persistedOcrExpiries?: Record<string, unknown>
): CAQueueItem {
  const merged = {
    ...parseJsonObject(persistedOcrExpiries),
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
