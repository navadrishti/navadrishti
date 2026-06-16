import { NextRequest, NextResponse } from 'next/server';
import { getCAFromRequest } from '@/lib/server-auth';

// Mock data for unverified NGOs
const mockNGOs = [
  {
    id: 1,
    user_id: 301,
    ngo_name: 'Education for All Foundation',
    email: 'contact@educationforall.org',
    phone: '+91-7654321000',
    registration_number: 'DL/2019/0045678',
    registration_type: 'Trust',
    trust_registration_date: '2019-05-12',
    fcra_number: 'DL/2020/0012345',
    fcra_status: 'Approved',
    section_12a: '12A/2020-DL/45678',
    section_80g: '80G/2020-DL/45678',
    sector: ['Education', 'Child Welfare', 'Skill Development'],
    ngo_description: 'Providing quality education to underprivileged children',
    registered_address: 'New Delhi, India',
    verification_documents: ['trust_deed.pdf', 'fcra_certificate.pdf', '12a_letter.pdf', '80g_letter.pdf'],
    verification_status: 'unverified',
    submitted_at: '2026-05-01T09:30:00Z',
    documents_verified: 2,
    documents_total: 4
  },
  {
    id: 2,
    user_id: 302,
    ngo_name: 'Clean Water Initiative',
    email: 'info@cleanwater.ngo',
    phone: '+91-7654321001',
    registration_number: 'MH/2018/0023456',
    registration_type: 'Society',
    trust_registration_date: '2018-08-20',
    fcra_number: 'MH/2019/0067890',
    fcra_status: 'Approved',
    section_12a: '12A/2019-MH/23456',
    section_80g: '80G/2019-MH/23456',
    sector: ['Water & Sanitation', 'Health', 'Community Development'],
    ngo_description: 'Working towards clean drinking water accessibility in rural areas',
    registered_address: 'Mumbai, India',
    verification_documents: ['society_registration.pdf', 'fcra_certificate.pdf', '12a_letter.pdf', '80g_letter.pdf'],
    verification_status: 'unverified',
    submitted_at: '2026-05-02T13:45:00Z',
    documents_verified: 3,
    documents_total: 4
  },
  {
    id: 3,
    user_id: 303,
    ngo_name: 'Women Empowerment Network',
    email: 'support@womenempowerment.org',
    phone: '+91-7654321002',
    registration_number: 'TN/2020/0087654',
    registration_type: 'Trust',
    trust_registration_date: '2020-03-15',
    fcra_number: 'TN/2021/0043210',
    fcra_status: 'Pending',
    section_12a: '12A/2021-TN/87654',
    section_80g: '80G/2021-TN/87654',
    sector: ['Women Empowerment', 'Skill Training', 'Livelihood'],
    ngo_description: 'Empowering women through skill development and entrepreneurship training',
    registered_address: 'Chennai, India',
    verification_documents: ['trust_deed.pdf', 'fcra_application.pdf', '12a_letter.pdf', '80g_letter.pdf'],
    verification_status: 'unverified',
    submitted_at: '2026-05-03T16:20:00Z',
    documents_verified: 1,
    documents_total: 4
  }
];

export async function GET(request: NextRequest) {
  try {
    getCAFromRequest(request);

    const status = request.nextUrl.searchParams.get('status') || 'unverified';

    // Filter by status
    const filtered = mockNGOs.filter(ngo => ngo.verification_status === status);

    return NextResponse.json({
      success: true,
      data: filtered,
      count: filtered.length,
      type: 'ngos'
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'CA authentication required') {
      return NextResponse.json({ error: 'CA authentication required' }, { status: 401 });
    }
    console.error('NGOs API error:', error);
    return NextResponse.json({ error: 'Failed to fetch NGOs' }, { status: 500 });
  }
}
