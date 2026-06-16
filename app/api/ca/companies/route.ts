import { NextRequest, NextResponse } from 'next/server';
import { getCAFromRequest } from '@/lib/server-auth';

const mockCompanies = [
  {
    id: 1,
    user_id: 201,
    company_name: 'TechVision Solutions',
    email: 'contact@techvision.com',
    phone: '+91-8765432100',
    gst: '18AABCT1234A1Z5',
    pan: 'AABCT1234A',
    cin: 'U72100DL2020PTC356789',
    company_type: 'Private Limited',
    registration_number: 'DL-2020-12345',
    registration_date: '2020-06-15',
    registered_address: 'New Delhi, India',
    registration_documents: ['gst_certificate.pdf', 'pan_certificate.pdf', 'cin_doc.pdf'],
    business_description: 'Software Development and IT Consulting',
    verification_status: 'unverified',
    submitted_at: '2026-05-01T11:20:00Z',
    documents_verified: 1,
    documents_total: 3
  },
  {
    id: 2,
    user_id: 202,
    company_name: 'GreenEnergy Industries',
    email: 'info@greenenergy.com',
    phone: '+91-8765432101',
    gst: '27AABCR9876B2Z0',
    pan: 'AABCR9876B',
    cin: 'U27100MH2019PTC323456',
    company_type: 'Limited Company',
    registration_number: 'MH-2019-54321',
    registration_date: '2019-03-20',
    registered_address: 'Mumbai, India',
    registration_documents: ['gst_certificate.pdf', 'pan_certificate.pdf', 'cin_doc.pdf'],
    business_description: 'Renewable Energy Solutions',
    verification_status: 'unverified',
    submitted_at: '2026-05-02T15:45:00Z',
    documents_verified: 2,
    documents_total: 3
  },
  {
    id: 3,
    user_id: 203,
    company_name: 'HealthCare Plus Ltd',
    email: 'hr@healthcareplus.com',
    phone: '+91-8765432102',
    gst: '33AABCH5432C1Z2',
    pan: 'AABCH5432C',
    cin: 'U85100TN2021PTC128901',
    company_type: 'Public Company',
    registration_number: 'TN-2021-98765',
    registration_date: '2021-01-10',
    registered_address: 'Chennai, India',
    registration_documents: ['gst_certificate.pdf', 'pan_certificate.pdf', 'cin_doc.pdf'],
    business_description: 'Healthcare and Medical Services',
    verification_status: 'unverified',
    submitted_at: '2026-05-03T10:15:00Z',
    documents_verified: 0,
    documents_total: 3
  },
  {
    id: 4,
    user_id: 204,
    company_name: 'BuildRight Constructions',
    email: 'ops@buildright.co.in',
    phone: '+91-9876543210',
    gst: '09AABCB2345D1Z8',
    pan: 'AABCB2345D',
    cin: 'U45200UP2018PTC412345',
    company_type: 'Private Limited',
    registration_number: 'UP-2018-67890',
    registration_date: '2018-08-22',
    registered_address: 'Lucknow, Uttar Pradesh, India',
    registration_documents: ['gst_certificate.pdf', 'pan_certificate.pdf', 'cin_doc.pdf'],
    business_description: 'Real Estate and Construction Services',
    verification_status: 'unverified',
    submitted_at: '2026-05-04T09:30:00Z',
    documents_verified: 1,
    documents_total: 3
  },
  {
    id: 5,
    user_id: 205,
    company_name: 'SwiftLog Freight Pvt Ltd',
    email: 'support@swiftlog.in',
    phone: '+91-9123456780',
    gst: '29AABCS6789E2Z3',
    pan: 'AABCS6789E',
    cin: 'U63090KA2017PTC289012',
    company_type: 'Private Limited',
    registration_number: 'KA-2017-34567',
    registration_date: '2017-11-05',
    registered_address: 'Bengaluru, Karnataka, India',
    registration_documents: ['gst_certificate.pdf', 'pan_certificate.pdf', 'cin_doc.pdf'],
    business_description: 'Logistics and Last-Mile Delivery Solutions',
    verification_status: 'unverified',
    submitted_at: '2026-05-05T14:00:00Z',
    documents_verified: 3,
    documents_total: 3
  },
  {
    id: 6,
    user_id: 206,
    company_name: 'DataPulse Analytics',
    email: 'hello@datapulse.io',
    phone: '+91-9988776655',
    gst: '36AABCD4321F1Z6',
    pan: 'AABCD4321F',
    cin: 'U74140TG2022PTC501234',
    company_type: 'Private Limited',
    registration_number: 'TG-2022-11223',
    registration_date: '2022-02-14',
    registered_address: 'Hyderabad, Telangana, India',
    registration_documents: ['gst_certificate.pdf', 'pan_certificate.pdf', 'cin_doc.pdf'],
    business_description: 'Business Intelligence and Data Analytics Tools',
    verification_status: 'unverified',
    submitted_at: '2026-05-06T08:45:00Z',
    documents_verified: 2,
    documents_total: 3
  },
  {
    id: 7,
    user_id: 207,
    company_name: 'NextGen Fintech Ltd',
    email: 'admin@nextgenft.in',
    phone: '+91-9871234560',
    gst: '27AABCN7654G2Z1',
    pan: 'AABCN7654G',
    cin: 'U65990MH2021PTC478901',
    company_type: 'Limited Company',
    registration_number: 'MH-2021-44556',
    registration_date: '2021-07-19',
    registered_address: 'Pune, Maharashtra, India',
    registration_documents: ['gst_certificate.pdf', 'pan_certificate.pdf', 'cin_doc.pdf'],
    business_description: 'Digital Lending, Credit Scoring and Payments',
    verification_status: 'unverified',
    submitted_at: '2026-05-07T13:10:00Z',
    documents_verified: 0,
    documents_total: 3
  },
  {
    id: 8,
    user_id: 208,
    company_name: 'AgroFresh Exports',
    email: 'export@agrofresh.com',
    phone: '+91-9456781230',
    gst: '24AABCA3210H1Z4',
    pan: 'AABCA3210H',
    cin: 'U01110GJ2016PTC234567',
    company_type: 'Private Limited',
    registration_number: 'GJ-2016-78901',
    registration_date: '2016-04-01',
    registered_address: 'Ahmedabad, Gujarat, India',
    registration_documents: ['gst_certificate.pdf', 'pan_certificate.pdf', 'cin_doc.pdf'],
    business_description: 'Agricultural Products Export and Cold Chain Logistics',
    verification_status: 'verified',
    submitted_at: '2026-04-10T07:00:00Z',
    documents_verified: 3,
    documents_total: 3
  },
  {
    id: 9,
    user_id: 209,
    company_name: 'EduSpark Technologies',
    email: 'contact@eduspark.in',
    phone: '+91-9345678901',
    gst: '09AABCE1122I2Z7',
    pan: 'AABCE1122I',
    cin: 'U80902DL2023PTC556677',
    company_type: 'Private Limited',
    registration_number: 'DL-2023-22334',
    registration_date: '2023-01-20',
    registered_address: 'New Delhi, India',
    registration_documents: ['gst_certificate.pdf', 'pan_certificate.pdf', 'cin_doc.pdf'],
    business_description: 'EdTech Platform for K-12 and Competitive Exam Prep',
    verification_status: 'verified',
    submitted_at: '2026-04-18T10:30:00Z',
    documents_verified: 3,
    documents_total: 3
  },
  {
    id: 10,
    user_id: 210,
    company_name: 'SkyRoute Aviation Services',
    email: 'ops@skyroute.aero',
    phone: '+91-9234567890',
    gst: '07AABCS9988J1Z9',
    pan: 'AABCS9988J',
    cin: 'U62100DL2015PTC123456',
    company_type: 'Public Company',
    registration_number: 'DL-2015-55678',
    registration_date: '2015-09-12',
    registered_address: 'New Delhi, India',
    registration_documents: ['gst_certificate.pdf', 'pan_certificate.pdf', 'cin_doc.pdf'],
    business_description: 'Ground Handling and Aviation Support Services',
    verification_status: 'verified',
    submitted_at: '2026-04-22T16:00:00Z',
    documents_verified: 3,
    documents_total: 3
  },
];

export async function GET(request: NextRequest) {
  try {
    getCAFromRequest(request);

    const status = request.nextUrl.searchParams.get('status') || 'unverified';

    const filtered =
      status === 'all'
        ? mockCompanies
        : mockCompanies.filter(comp => comp.verification_status === status);

    return NextResponse.json({
      success: true,
      data: filtered,
      count: filtered.length,
      type: 'companies'
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'CA authentication required') {
      return NextResponse.json({ error: 'CA authentication required' }, { status: 401 });
    }
    console.error('Companies API error:', error);
    return NextResponse.json({ error: 'Failed to fetch companies' }, { status: 500 });
  }
}