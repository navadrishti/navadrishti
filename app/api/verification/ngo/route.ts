// API endpoint for NGO verification using EntityLocker
import { NextRequest, NextResponse } from 'next/server';
import { EntityLockerService } from '@/lib/entitylocker';
import { supabase } from '@/lib/db';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '@/lib/auth';

const entityLocker = new EntityLockerService();

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
      .select('user_type')
      .eq('id', userId)
      .single();

    if (userError || !user || user.user_type !== 'ngo') {
      return NextResponse.json({ error: 'Only NGOs can use this verification method' }, { status: 403 });
    }

    const { action, organizationName, gstNumber, panNumber, registrationNumber, registrationType } = await req.json();

    switch (action) {
      case 'initiate':
        return await initiateNGOVerification(userId, organizationName, registrationNumber, registrationType);
      
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
  registrationType: string
) {
  // Check if EntityLocker service is available
  if (!entityLocker.isAvailable()) {
    return NextResponse.json({
      error: 'EntityLocker verification service is not configured. Please contact administrator.',
      code: 'SERVICE_NOT_CONFIGURED'
    }, { status: 503 });
  }

  try {
    // Generate EntityLocker authorization URL
    const authUrl = entityLocker.generateAuthUrl(userId, 'ngo');
    
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

    return NextResponse.json({
      success: true,
      authUrl,
      message: 'Please complete verification on EntityLocker'
    });
  } catch (error: any) {
    console.error('EntityLocker initiation error:', error);
    return NextResponse.json({
      error: error.message || 'Failed to initiate verification',
      code: 'INITIATION_FAILED'
    }, { status: 500 });
  }
}

async function verifyGST(userId: number, gstNumber: string) {
  // Validate GST number format
  if (!entityLocker.validateGSTNumber(gstNumber)) {
    return NextResponse.json({ error: 'Invalid GST number format' }, { status: 400 });
  }

  // In a real implementation, you would use the EntityLocker token to fetch data
  // For now, we'll simulate the verification process
  
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
  // Validate PAN number format (using DigiLocker service validation)
  const digiLockerService = new (require('@/lib/digilocker').DigiLockerService)();
  if (!digiLockerService.validatePANNumber(panNumber)) {
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