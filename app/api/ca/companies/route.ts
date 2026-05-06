import { NextRequest, NextResponse } from 'next/server';
import { getCAFromRequest } from '@/lib/server-ca-auth';

// Mock data for unverified companies
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
  }
];

export async function GET(request: NextRequest) {
  try {
    getCAFromRequest(request);

    const status = request.nextUrl.searchParams.get('status') || 'unverified';

    // Filter by status
    const filtered = mockCompanies.filter(comp => comp.verification_status === status);

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
