import { NextRequest, NextResponse } from 'next/server';
import { getCAFromRequest } from '@/lib/server-auth';

// Mock data for unverified individuals
const mockIndividuals = [
  {
    id: 1,
    user_id: 101,
    name: 'Rajesh Kumar',
    email: 'rajesh@email.com',
    phone: '+91-9876543210',
    aadhaar: '****-****-1234',
    pan: 'ABCDE1234F',
    skills: ['Python', 'Data Analysis', 'Machine Learning'],
    profession: 'Data Scientist',
    experience_years: 5,
    resume: 'https://example.com/resume-101.pdf',
    certificates: ['AWS Certified', 'Python Professional'],
    kyc_documents: ['aadhaar.pdf', 'pan.pdf', 'address_proof.pdf'],
    verification_status: 'unverified',
    submitted_at: '2026-05-01T10:30:00Z',
    documents_verified: 0,
    documents_total: 3
  },
  {
    id: 2,
    user_id: 102,
    name: 'Priya Singh',
    email: 'priya@email.com',
    phone: '+91-9876543211',
    aadhaar: '****-****-5678',
    pan: 'XYZAB5678G',
    skills: ['UI/UX Design', 'Figma', 'Adobe XD'],
    profession: 'UX Designer',
    experience_years: 3,
    resume: 'https://example.com/resume-102.pdf',
    certificates: ['Google UX Design', 'Figma Certified'],
    kyc_documents: ['aadhaar.pdf', 'pan.pdf', 'address_proof.pdf'],
    verification_status: 'unverified',
    submitted_at: '2026-05-02T14:15:00Z',
    documents_verified: 1,
    documents_total: 3
  },
  {
    id: 3,
    user_id: 103,
    name: 'Amit Patel',
    email: 'amit@email.com',
    phone: '+91-9876543212',
    aadhaar: '****-****-9012',
    pan: 'PQRST9012H',
    skills: ['Java', 'Spring Boot', 'Microservices'],
    profession: 'Backend Developer',
    experience_years: 7,
    resume: 'https://example.com/resume-103.pdf',
    certificates: ['Spring Boot Professional', 'Java Expert'],
    kyc_documents: ['aadhaar.pdf', 'pan.pdf', 'address_proof.pdf'],
    verification_status: 'unverified',
    submitted_at: '2026-05-03T09:45:00Z',
    documents_verified: 2,
    documents_total: 3
  }
];

export async function GET(request: NextRequest) {
  try {
    getCAFromRequest(request);

    const status = request.nextUrl.searchParams.get('status') || 'unverified';

    // Filter by status
    const filtered = mockIndividuals.filter(ind => ind.verification_status === status);

    return NextResponse.json({
      success: true,
      data: filtered,
      count: filtered.length,
      type: 'individuals'
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'CA authentication required') {
      return NextResponse.json({ error: 'CA authentication required' }, { status: 401 });
    }
    console.error('Individuals API error:', error);
    return NextResponse.json({ error: 'Failed to fetch individuals' }, { status: 500 });
  }
}
