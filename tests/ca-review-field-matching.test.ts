import { describe, expect, it } from 'vitest'
import { buildCrossDocumentComparisons, pickDocField } from '@/lib/ca-review/cross-field-comparisons'
import { compactId, valuesMatch } from '@/lib/ca-review/field-matching'
import { CA_QUEUE_TYPES, type CAFieldComparison, type CAReviewDocument } from '@/lib/ca-review-types'

function doc(key: string, label: string, fields: Record<string, string> = {}): CAReviewDocument {
  return {
    id: `doc-${key}`,
    key,
    label,
    file_name: `${key}.pdf`,
    file_url: `https://files.example.com/${key}.pdf`,
    is_image: false,
    ocr_fields: Object.entries(fields).map(([label, value]) => ({ label, value })),
    ocr_status: 'completed',
  }
}

function byField(rows: CAFieldComparison[], field: string) {
  const row = rows.find((entry) => entry.field === field)
  if (!row) throw new Error(`missing ${field}`)
  return row
}

describe('CA_QUEUE_TYPES', () => {
  it('lists the three queues', () => {
    expect(CA_QUEUE_TYPES).toEqual(['individuals', 'companies', 'ngos'])
  })
})

describe('compactId', () => {
  it.each([
    [' ab-c d ', 'ABCD'],
    ['abcde 1234 f', 'ABCDE1234F'],
    ['27-aaapl-1234c-1z5', '27AAAPL1234C1Z5'],
    ['MH/123/2020', 'MH1232020'],
    ['u85110.mh_2020', 'U85110MH2020'],
  ])('compacts %j', (input, expected) => {
    expect(compactId(input)).toBe(expected)
  })
})

describe('valuesMatch', () => {
  it.each([
    ['Mr. Ramesh Kumar', 'RAMESH KUMAR', true],
    ['Smt Sita Devi', 'sita devi', true],
    ['Ramesh K', 'Ramesh Kumar', true],
    ['Ram Kumar', 'Ramesh Kumar', true],
    ['Kumar Ramesh', 'Ramesh Kumar', true],
    ['M/S Acme Traders', 'Acme Traders', true],
    ['Suresh Kumar', 'Ramesh Kumar', false],
    ['', 'Ramesh Kumar', false],
    ['Dr', 'Dr', false],
  ])('name %j vs %j is %s', (a, b, expected) => {
    expect(valuesMatch('name', a, b)).toBe(expected)
  })

  it.each([
    ['2024-03-05', '05/03/2024', true],
    ['2024-3-5', '5-3-2024', true],
    ['2024/03/05', '2024-03-05', true],
    ['5 March 2024', '2024-03-05', true],
    ['2024-03-05', '03/05/2024', false],
    ['2024-03-05', '2025-03-05', false],
  ])('date %j vs %j is %s', (a, b, expected) => {
    expect(valuesMatch('date', a, b)).toBe(expected)
  })

  it.each([
    ['12, MG Road, Pune 411001', '12 MG Road Pune', true],
    ['MG Road Pune', 'Near MG Road Pune India', true],
    ['Gandhi Nagar, Pune, Maharashtra', 'Gandhi Nagar, Nashik, Maharashtra', true],
    ['Gandhi Nagar Pune Kothrud', 'Gandhi Nagar Nashik Satpur', false],
    ['Flat 4, Green Park, Delhi', 'Plot 9, Sector 5, Mumbai', false],
    ['', 'MG Road', false],
  ])('address %j vs %j is %s', (a, b, expected) => {
    expect(valuesMatch('address', a, b)).toBe(expected)
  })

  it.each([
    ['abcde1234f', 'ABCDE 1234 F', true],
    ['27AAAPL1234C1Z5', '27-AAAPL-1234C-1Z5', true],
    ['ABCDE1234F', 'ABCDE1234G', false],
    ['1234 5678 9012', '123456789012', true],
    ['MH/123/2020', 'MH-123-2020', true],
    ['mh.123.2020', 'MH_123_2020', true],
    ['abcde1234f', 'ABCDE1234F', true],
    ['MH/123/2020', 'MH/124/2020', false],
  ])('id %j vs %j is %s', (a, b, expected) => {
    expect(valuesMatch('id', a, b)).toBe(expected)
  })
})

describe('pickDocField', () => {
  it('matches labels ignoring case, spaces and hyphens', () => {
    expect(pickDocField(doc('x', 'X', { ' pan-number ': ' ABCDE1234F ' }), ['PAN Number'])).toBe('ABCDE1234F')
  })

  it('prefers earlier labels and skips blank values', () => {
    const source = doc('x', 'X', { Name: 'Short', 'Full Name': '  ', 'Account Holder Name': 'Holder' })
    expect(pickDocField(source, ['Full Name', 'Name'])).toBe('Short')
    expect(pickDocField(source, ['Account Holder Name', 'Name'])).toBe('Holder')
  })

  it('returns an empty string when nothing matches', () => {
    expect(pickDocField(doc('x', 'X', { GSTIN: '1' }), ['CIN'])).toBe('')
  })
})

describe('buildCrossDocumentComparisons', () => {
  const aadhaar = doc('individualAadhaar', 'Aadhaar Card', {
    Name: 'RAMESH KUMAR',
    'Aadhaar Number': '123456789012',
    'Date of Birth': '01/02/1990',
  })
  const pan = doc('individualPanCard', 'PAN Card', {
    Name: 'Ramesh Kumar',
    'PAN Number': 'ABCDE1234F',
    'Date of Birth': '1990-02-01',
    "Father's Name": 'Suresh Kumar',
  })
  const item = { name: 'Mr Ramesh Kumar', pan: 'abcde 1234 f', aadhaar: '1234 5678 9012' }

  it('returns one row per field for each queue type', () => {
    expect(buildCrossDocumentComparisons('individuals', []).map((row) => row.field)).toEqual([
      'Name',
      'Date of Birth',
      "Father's Name",
      'Address',
      'Aadhaar Number',
      'PAN Number',
    ])
    expect(buildCrossDocumentComparisons('companies', []).map((row) => row.field)).toEqual([
      'Name',
      'Address',
      'Date of Incorporation',
      'PAN Number',
      'GSTIN',
      'CIN',
    ])
    expect(buildCrossDocumentComparisons('ngos', [])).toHaveLength(13)
  })

  it('marks fields that agree across the form and documents', () => {
    const rows = buildCrossDocumentComparisons('individuals', [aadhaar, pan], item)
    expect(byField(rows, 'Name')).toMatchObject({ status: 'match', match: true, deviations: [] })
    expect(byField(rows, 'Name').sources.map((source) => source.document)).toEqual([
      'Form input',
      'Aadhaar Card',
      'PAN Card',
    ])
    expect(byField(rows, 'Date of Birth').status).toBe('match')
    expect(byField(rows, 'Aadhaar Number').status).toBe('match')
    expect(byField(rows, 'PAN Number').status).toBe('match')
  })

  it('only compares id fields against their own document', () => {
    const rows = buildCrossDocumentComparisons('individuals', [aadhaar, pan], item)
    expect(byField(rows, 'PAN Number').sources.map((source) => source.document)).toEqual(['Form input', 'PAN Card'])
    expect(byField(rows, 'Aadhaar Number').sources.map((source) => source.document)).toEqual([
      'Form input',
      'Aadhaar Card',
    ])
  })

  it.each([
    ["Father's Name", 'one value'],
    ['Address', 'no values'],
  ])('marks %s with %s as incomplete', (field) => {
    const row = byField(buildCrossDocumentComparisons('individuals', [aadhaar, pan], item), field)
    expect(row).toMatchObject({ status: 'incomplete', match: false, deviations: [] })
  })

  it('flags the form input when it disagrees with the documents', () => {
    const rows = buildCrossDocumentComparisons('individuals', [aadhaar, pan], { ...item, pan: 'ABCDE9999F' })
    const row = byField(rows, 'PAN Number')
    expect(row).toMatchObject({ status: 'mismatch', match: false, deviations: ['Form input'] })
    expect(row.sources.find((source) => source.origin === 'input')?.deviation).toBe(true)
  })

  it('takes the majority document value as canonical', () => {
    const rows = buildCrossDocumentComparisons('individuals', [
      doc('a', 'Doc A', { Name: 'Ramesh Kumar' }),
      doc('b', 'Doc B', { 'Full Name': 'RAMESH KUMAR' }),
      doc('c', 'Doc C', { Name: 'Suresh Patil' }),
    ])
    expect(byField(rows, 'Name')).toMatchObject({ status: 'mismatch', deviations: ['Doc C'] })
  })

  it('stays incomplete with only the form value', () => {
    const row = byField(buildCrossDocumentComparisons('individuals', [], item), 'Name')
    expect(row.sources).toEqual([{ document: 'Form input', value: 'Mr Ramesh Kumar', origin: 'input', deviation: false }])
    expect(row.status).toBe('incomplete')
  })

  it('compares NGO numbers and expiries against the matching certificate', () => {
    const rows = buildCrossDocumentComparisons(
      'ngos',
      [
        doc('ngoRegistrationCertificate', 'Registration Certificate', { 'Registration Number': 'MH-2020-123' }),
        doc('ngoTwelveACertificate', '12A Certificate', { '12A Number': 'AAATH1234F E20214', 'Valid Until': '31/03/2027' }),
        doc('ngoPanCard', 'PAN Card of NGO', { 'PAN Number': 'AAATH1234F', 'Valid Until': '01/01/2000' }),
      ],
      {
        registration_number: 'MH2020123',
        twelve_a: 'AAATH1234FE20214',
        twelve_a_expiry: '2027-03-31',
        pan: 'AAATH1234G',
      }
    )
    expect(byField(rows, 'Registration Number').status).toBe('match')
    expect(byField(rows, '12A Number').status).toBe('match')
    expect(byField(rows, '12A Expiry')).toMatchObject({ status: 'match' })
    expect(byField(rows, '12A Expiry').sources.map((source) => source.document)).toEqual(['Form input', '12A Certificate'])
    expect(byField(rows, 'PAN Number')).toMatchObject({ status: 'mismatch', deviations: ['Form input'] })
    expect(byField(rows, 'FCRA Number').status).toBe('incomplete')
  })

  it('compares company GSTIN and CIN', () => {
    const rows = buildCrossDocumentComparisons(
      'companies',
      [
        doc('companyGstCertificate', 'GST Certificate', { 'GST Number': '27AAAPL1234C1Z5', 'Legal Name': 'Acme Pvt Ltd' }),
        doc('companyIncorporationCertificate', 'Certificate of Incorporation', {
          CIN: 'U12345MH2020PTC123456',
          'Company Name': 'ACME PVT. LTD.',
        }),
      ],
      { company_name: 'Acme Pvt Ltd', gst: '27aaapl1234c1z5', cin: 'U12345MH2020PTC999999' }
    )
    expect(byField(rows, 'Name').status).toBe('match')
    expect(byField(rows, 'GSTIN').status).toBe('match')
    expect(byField(rows, 'CIN')).toMatchObject({ status: 'mismatch', deviations: ['Form input'] })
  })
})
