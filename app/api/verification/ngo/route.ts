// API endpoint for NGO verification (manual document-first flow)
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '@/lib/auth';

function isValidGSTNumber(gstNumber: string): boolean {
  const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  return gstRegex.test(gstNumber);
}

function isValidPANNumber(panNumber: string): boolean {
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
  return panRegex.test(panNumber);
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const userId = decoded.id; // Changed from decoded.userId to decoded.id

    // Validate userId
    if (!userId) {
      return NextResponse.json({ error: 'Invalid token: missing user ID' }, { status: 401 });
    }

    // Verify user is an NGO
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('user_type, profile_data')
      .eq('id', userId)
      .single();

    if (userError || !user || user.user_type !== 'ngo') {
      return NextResponse.json({ error: 'Only NGOs can use this verification method' }, { status: 403 });
    }

    const { action, organizationName, gstNumber, panNumber, registrationNumber, registrationType, documents } = await req.json();

    switch (action) {
      case 'initiate':
        return await initiateNGOVerification(userId, organizationName, registrationNumber, registrationType, user?.profile_data, documents);
      
      case 'verify-gst':
        return await verifyGST(userId, gstNumber);
      
      case 'verify-pan':
        return await verifyNGOPAN(userId, panNumber);
      
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('NGO verification error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function initiateNGOVerification(
  userId: number, 
  organizationName: string, 
  registrationNumber: string, 
  registrationType: string,
  profileData?: any,
  documents?: Record<string, string>
) {
  try {
    // Create or update verification record using Supabase
    const { data: existingVerification } = await supabase
      .from('ngo_verifications')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!existingVerification) {
      await supabase
        .from('ngo_verifications')
        .insert({
          user_id: userId,
          ngo_name: organizationName,
          registration_number: registrationNumber,
          registration_type: registrationType,
          verification_status: 'pending'
        });
    } else {
      await supabase
        .from('ngo_verifications')
        .update({
          ngo_name: organizationName,
          registration_number: registrationNumber,
          registration_type: registrationType
        })
        .eq('user_id', userId);
    }

    const existingProfileData = (profileData && typeof profileData === 'object') ? profileData : {};
    const existingVerificationDocs = (existingProfileData.verification_documents && typeof existingProfileData.verification_documents === 'object')
      ? existingProfileData.verification_documents
      : {};

    await supabase
      .from('users')
      .update({
        profile_data: {
          ...existingProfileData,
          verification_documents: {
            ...existingVerificationDocs,
            ngo: {
              ...(existingVerificationDocs.ngo || {}),
              documents: documents || {},
              submitted_at: new Date().toISOString(),
              status: 'pending'
            }
          }
        },
        verification_status: 'pending'
      })
      .eq('id', userId);

    return NextResponse.json({
      success: true,
      authUrl: null,
      mode: 'manual',
      message: 'Verification initiated in manual mode. Your uploaded documents will be reviewed by admin.'
    });
  } catch (error: any) {
    console.error('NGO verification initiation error:', error);
    return NextResponse.json({
      error: error.message || 'Failed to initiate verification',
      code: 'INITIATION_FAILED'
    }, { status: 500 });
  }
}

async function verifyGST(userId: number, gstNumber: string) {
  // Validate GST number format
  if (!isValidGSTNumber(gstNumber)) {
    return NextResponse.json({ error: 'Invalid GST number format' }, { status: 400 });
  }
  
  // First get current verification status to check if PAN is verified
  const { data: currentVerification } = await supabase
    .from('ngo_verifications')
    .select('pan_verified')
    .eq('user_id', userId)
    .single();

  const newStatus = currentVerification?.pan_verified ? 'verified' : 'pending';

  await supabase
    .from('ngo_verifications')
    .update({
      gst_number: gstNumber,
      gst_verified: true,
      gst_verification_date: new Date().toISOString(),
      verification_status: newStatus
    })
    .eq('user_id', userId);

  return NextResponse.json({
    success: true,
    message: 'GST verification completed'
  });
}

async function verifyNGOPAN(userId: number, panNumber: string) {
  // Validate PAN number format
  if (!isValidPANNumber(panNumber)) {
    return NextResponse.json({ error: 'Invalid PAN number format' }, { status: 400 });
  }

  // First get current verification status to check if GST is verified
  const { data: currentVerification } = await supabase
    .from('ngo_verifications')
    .select('gst_verified')
    .eq('user_id', userId)
    .single();

  const newStatus = currentVerification?.gst_verified ? 'verified' : 'pending';

  await supabase
    .from('ngo_verifications')
    .update({
      pan_number: panNumber,
      pan_verified: true,
      pan_verification_date: new Date().toISOString(),
      verification_status: newStatus
    })
    .eq('user_id', userId);

  // Check if both documents are verified
  const { data: verification } = await supabase
    .from('ngo_verifications')
    .select('gst_verified, pan_verified')
    .eq('user_id', userId)
    .single();

  if (verification && verification.gst_verified && verification.pan_verified) {
    await supabase
      .from('users')
      .update({
        verification_status: 'verified',
        verified_at: new Date().toISOString(),
        verification_level: 'advanced'
      })
      .eq('id', userId);
  }

  return NextResponse.json({
    success: true,
    message: 'PAN verification completed'
  });
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const userId = decoded.id; // Changed from decoded.userId to decoded.id

    // Validate userId
    if (!userId) {
      return NextResponse.json({ error: 'Invalid token: missing user ID' }, { status: 401 });
    }

    // Get verification status from Supabase
    const { data: verification, error } = await supabase
      .from('ngo_verifications')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !verification) {
      return NextResponse.json({
        verified: false,
        gstVerified: false,
        panVerified: false,
        status: 'unverified'
      });
    }

    return NextResponse.json({
      verified: verification.verification_status === 'verified',
      gstVerified: verification.gst_verified || false,
      panVerified: verification.pan_verified || false,
      organizationName: verification.ngo_name,
      registrationNumber: verification.registration_number,
      registrationType: verification.registration_type,
      status: verification.verification_status,
      verifiedAt: verification.verification_date,
      fcraNumber: verification.fcra_number
    });
  } catch (error) {
    console.error('Get NGO verification status error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}