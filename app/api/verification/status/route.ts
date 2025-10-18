import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { supabase } from '@/lib/db';
import { JWT_SECRET } from '@/lib/auth';

interface JWTPayload {
  userId: number;
  email: string;
  userType: string;
}

export async function GET(request: NextRequest) {
  try {
    // Get JWT token from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify JWT token
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const userId = decoded.id; // Changed from decoded.userId to decoded.id

    // Validate userId
    if (!userId) {
      return NextResponse.json({ error: 'Invalid token: missing user ID' }, { status: 401 });
    }

    // Get verification status from all three tables
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
        .single()
    ]);

    // Combine all verification data
    let verificationData: any = {
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

    // Process individual verification
    if (individualResult.status === 'fulfilled' && individualResult.value.data) {
      const data = individualResult.value.data as any;
      verificationData.individual = {
        aadhaarVerified: data.aadhaar_verified,
        panVerified: data.pan_verified,
        verified: data.verified,
        status: data.status,
        verifiedAt: data.verified_at
      };
      
      if (data.verified) {
        verificationData.overall.verified = true;
        verificationData.overall.status = data.status;
        verificationData.overall.verifiedAt = data.verified_at;
        verificationData.overall.level = (data.aadhaar_verified && data.pan_verified) ? 'advanced' : 'intermediate';
      }
    }

    // Process NGO verification
    if (ngoResult.status === 'fulfilled' && ngoResult.value.data) {
      const data = ngoResult.value.data as any;
      verificationData.ngo = {
        organizationName: data.organization_name,
        registrationNumber: data.registration_number,
        registrationType: data.registration_type,
        gstVerified: data.gst_verified,
        panVerified: data.pan_verified,
        verified: data.verified,
        status: data.status,
        verifiedAt: data.verified_at
      };
      
      if (data.verified) {
        verificationData.overall.verified = true;
        verificationData.overall.status = data.status;
        verificationData.overall.verifiedAt = data.verified_at;
        verificationData.overall.level = (data.gst_verified && data.pan_verified) ? 'advanced' : 'intermediate';
      }
    }

    // Process company verification
    if (companyResult.status === 'fulfilled' && companyResult.value.data) {
      const data = companyResult.value.data as any;
      verificationData.company = {
        companyName: data.company_name,
        cinNumber: data.cin_number,
        companyType: data.company_type,
        gstVerified: data.gst_verified,
        panVerified: data.pan_verified,
        verified: data.verified,
        status: data.status,
        verifiedAt: data.verified_at
      };
      
      if (data.verified) {
        verificationData.overall.verified = true;
        verificationData.overall.status = data.status;
        verificationData.overall.verifiedAt = data.verified_at;
        verificationData.overall.level = (data.gst_verified && data.pan_verified) ? 'advanced' : 'intermediate';
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