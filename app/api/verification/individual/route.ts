// API endpoint for individual verification using DigiLocker
import { NextRequest, NextResponse } from 'next/server';
import { DigiLockerService } from '@/lib/digilocker';
import { db } from '@/lib/db';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '@/lib/auth';

const digiLocker = new DigiLockerService();

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

    // Verify user is an individual
    const user = await db.users.findById(userId);
    
    if (!user) {
      console.error('User not found:', userId);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.user_type !== 'individual') {
      return NextResponse.json({ error: 'Only individuals can use this verification method' }, { status: 403 });
    }

    const { action, documentType, aadhaarNumber, panNumber } = await req.json();

    switch (action) {
      case 'initiate':
        return await initiateVerification(userId, documentType);
      
      case 'verify-aadhaar':
        return await verifyAadhaar(userId, aadhaarNumber);
      
      case 'verify-pan':
        return await verifyPAN(userId, panNumber);
      
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Individual verification error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function initiateVerification(userId: number, documentType: 'aadhaar' | 'pan') {
  // Check if DigiLocker service is available
  if (!digiLocker.isAvailable()) {
    return NextResponse.json({
      error: 'DigiLocker verification service is not configured. Please contact administrator.',
      code: 'SERVICE_NOT_CONFIGURED'
    }, { status: 503 });
  }

  try {
    // Generate DigiLocker authorization URL
    const authUrl = digiLocker.generateAuthUrl(userId, documentType);
    
    // Create or update verification record
    const existingVerification = await db.individualVerifications.findByUserId(userId);

    if (!existingVerification) {
      await db.individualVerifications.create({
        user_id: userId,
        verification_status: 'pending'
      });
    }

    return NextResponse.json({
      success: true,
      authUrl,
      message: 'Please complete verification on DigiLocker'
    });
  } catch (error: any) {
    console.error('DigiLocker initiation error:', error);
    return NextResponse.json({
      error: error.message || 'Failed to initiate verification',
      code: 'INITIATION_FAILED'
    }, { status: 500 });
  }
}

async function verifyAadhaar(userId: number, aadhaarNumber: string) {
  // Validate Aadhaar number format
  if (!digiLocker.validateAadhaarNumber(aadhaarNumber)) {
    return NextResponse.json({ error: 'Invalid Aadhaar number format' }, { status: 400 });
  }

  // In a real implementation, you would use the DigiLocker token to fetch data
  // For now, we'll simulate the verification process
  
  const verification = await db.individualVerifications.findByUserId(userId);
  
  await db.individualVerifications.update(userId, {
    aadhaar_number: aadhaarNumber,
    aadhaar_verified: true,
    aadhaar_verification_date: new Date().toISOString(),
    verification_status: verification?.pan_verified ? 'verified' : 'pending'
  });

  // Update user verification status
  await db.users.update(userId, {
    verification_status: 'pending'
  });

  return NextResponse.json({
    success: true,
    message: 'Aadhaar verification completed'
  });
}

async function verifyPAN(userId: number, panNumber: string) {
  // Validate PAN number format
  if (!digiLocker.validatePANNumber(panNumber)) {
    return NextResponse.json({ error: 'Invalid PAN number format' }, { status: 400 });
  }

  const verification = await db.individualVerifications.findByUserId(userId);
  
  await db.individualVerifications.update(userId, {
    pan_number: panNumber,
    pan_verified: true,
    pan_verification_date: new Date().toISOString(),
    verification_status: verification?.aadhaar_verified ? 'verified' : 'pending'
  });

  // Check if both documents are verified
  const updatedVerification = await db.individualVerifications.findByUserId(userId);

  if (updatedVerification?.aadhaar_verified && updatedVerification?.pan_verified) {
    await db.users.update(userId, {
      verification_status: 'verified',
      verified_at: new Date().toISOString(),
      verification_level: 'advanced'
    });
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
      console.error('Missing or invalid authorization header');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const userId = decoded.id; // Changed from decoded.userId to decoded.id

    // Validate userId
    if (!userId) {
      console.error('Invalid token: missing user ID');
      return NextResponse.json({ error: 'Invalid token: missing user ID' }, { status: 401 });
    }

    // First check if user exists
    const user = await db.users.findById(userId);

    if (!user) {
      console.error('User not found:', userId);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.user_type !== 'individual') {
      console.error('User is not an individual:', user.user_type);
      return NextResponse.json({ error: 'Invalid user type for individual verification' }, { status: 400 });
    }

    // Check if individual_verifications record exists, if not create one
    let verification = await db.individualVerifications.findByUserId(userId);

    if (!verification) {
      // Create initial verification record
      verification = await db.individualVerifications.create({
        user_id: userId,
        aadhaar_verified: false,
        pan_verified: false,
        verification_status: 'unverified'
      });

      // Return default unverified status
      return NextResponse.json({
        verified: false,
        aadhaarVerified: false,
        panVerified: false,
        status: 'unverified',
        level: 'basic'
      });
    }
    
    return NextResponse.json({
      verified: verification.verification_status === 'verified',
      aadhaarVerified: verification.aadhaar_verified || false,
      panVerified: verification.pan_verified || false,
      status: verification.verification_status || 'unverified',
      verifiedAt: verification.verification_date,
      level: user.verification_level || 'basic'
    });
  } catch (error) {
    console.error('Get verification status error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch verification status', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}