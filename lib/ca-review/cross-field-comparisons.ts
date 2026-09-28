import type { CAFieldComparison, CAFieldComparisonSource, CAQueueType, CAReviewDocument } from '@/lib/ca-review-types'
import { compactId, valuesMatch, type FieldKind } from './field-matching'

type CrossFieldSpec = {
  field: string
  kind: FieldKind
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

export function pickDocField(doc: CAReviewDocument, labels: string[]) {
  const wanted = labels.map((label) => compactId(label))
  for (const label of wanted) {
    const field = doc.ocr_fields.find((entry) => compactId(entry.label) === label && entry.value?.trim())
    if (field) return field.value.trim()
  }
  return ''
}

function pickCanonicalValue(kind: FieldKind, values: string[]) {
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

export function buildCrossDocumentComparisons(
  type: CAQueueType,
  documents: CAReviewDocument[],
  item: Record<string, unknown> = {}
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
