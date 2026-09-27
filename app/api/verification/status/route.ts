import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getTokenClaims } from '@/lib/auth';

type VerificationLevel = 'basic' | 'intermediate' | 'advanced';

type VerificationStatusResponse = {
  overall: {
    verified: boolean;
    status: string | null;
    level: VerificationLevel;
    verifiedAt: string | null;
  };
  individual: {
    aadhaarVerified: boolean | null;
    panVerified: boolean | null;
    verified: boolean;
    status: string | null;
    verifiedAt: string | null;
  } | null;
  ngo: {
    organizationName: string | null;
    registrationNumber: string | null;
    registrationType: string | null;
    gstVerified: boolean;
    panVerified: boolean;
    verified: boolean;
    status: string | null;
    verifiedAt: string | null;
  } | null;
  company: {
    companyName: string | null;
    verified: boolean;
    status: string | null;
    verifiedAt: string | null;
  } | null;
};

export async function GET(request: NextRequest) {
  try {
    const claims = getTokenClaims(request);
    if (!claims) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const userId = claims.id;
    if (!userId) {
      return NextResponse.json({ error: 'Invalid token: missing user ID' }, { status: 401 });
    }

    const [individualResult, ngoResult, companyResult] = await Promise.allSettled([
      supabase
        .from('individual_verifications')
        .select('*')
        .eq('user_id', userId)
        .single(),
      supabase
        .from('ngo_verifications')
        .select('*')
        .eq('user_id', userId)
        .single(),
      supabase
        .from('company_verifications')
        .select('*')
        .eq('user_id', userId)
        .single(),
    ]);

    // Combine all verification data
    const verificationData: VerificationStatusResponse = {
      overall: {
        verified: false,
        status: 'unverified',
        level: 'basic',
        verifiedAt: null
      },
      individual: null,
      ngo: null,
      company: null
    };

    if (individualResult.status === 'fulfilled' && individualResult.value.data) {
      const data = individualResult.value.data;
      verificationData.individual = {
        aadhaarVerified: data.aadhaar_verified,
        panVerified: data.pan_verified,
        verified: data.verification_status === 'verified',
        status: data.verification_status,
        verifiedAt: data.verification_date
      };
      
      if (data.verification_status === 'verified') {
        verificationData.overall.verified = true;
        verificationData.overall.status = data.verification_status;
        verificationData.overall.verifiedAt = data.verification_date;
        verificationData.overall.level = (data.aadhaar_verified && data.pan_verified) ? 'advanced' : 'intermediate';
      }
    }

    if (ngoResult.status === 'fulfilled' && ngoResult.value.data) {
      const data = ngoResult.value.data;
      verificationData.ngo = {
        organizationName: data.ngo_name,
        registrationNumber: data.registration_number,
        registrationType: data.registration_type,
        gstVerified: Boolean(data.gst_verified),
        panVerified: Boolean(data.pan_verified),
        verified: data.verification_status === 'verified',
        status: data.verification_status,
        verifiedAt: data.verification_date
      };
      
      if (data.verification_status === 'verified') {
        verificationData.overall.verified = true;
        verificationData.overall.status = data.verification_status;
        verificationData.overall.verifiedAt = data.verification_date;
        verificationData.overall.level = (data.gst_verified && data.pan_verified) ? 'advanced' : 'intermediate';
      }
    }

    if (companyResult.status === 'fulfilled' && companyResult.value.data) {
      const data = companyResult.value.data;
      verificationData.company = {
        companyName: data.company_name,
        verified: data.verification_status === 'verified',
        status: data.verification_status,
        verifiedAt: data.verification_date
      };
      
      // company_verifications has no GST/PAN flags, so a verified company never reaches 'advanced'.
      if (data.verification_status === 'verified') {
        verificationData.overall.verified = true;
        verificationData.overall.status = data.verification_status;
        verificationData.overall.verifiedAt = data.verification_date;
        verificationData.overall.level = 'intermediate';
      }
    }

    return NextResponse.json(verificationData);

  } catch (error) {
    console.error('Verification status error:', error);
    return NextResponse.json(
      { error: 'Failed to get verification status' },
      { status: 500 }
    );
  }
}