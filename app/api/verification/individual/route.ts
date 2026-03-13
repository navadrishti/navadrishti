// API endpoint for individual verification (manual document-first flow)
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '@/lib/auth';

function isValidAadhaarNumber(aadhaarNumber: string): boolean {
  return /^\d{12}$/.test(aadhaarNumber);
}

function isValidPANNumber(panNumber: string): boolean {
  return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(panNumber);
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

    // Verify user is an individual
    const user = await db.users.findById(userId);
    
    if (!user) {
      console.error('User not found:', userId);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.user_type !== 'individual') {
      return NextResponse.json({ error: 'Only individuals can use this verification method' }, { status: 403 });
    }

    const { action, documentType, aadhaarNumber, panNumber, documents } = await req.json();

    switch (action) {
      case 'initiate':
        return await initiateVerification(userId, documentType, documents);
      
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

async function initiateVerification(userId: number, documentType: 'aadhaar' | 'pan', documents?: Record<string, string>) {
  try {
    // Create or update verification record
    const existingVerification = await db.individualVerifications.findByUserId(userId);

    if (!existingVerification) {
      await db.individualVerifications.create({
        user_id: userId,
        verification_status: 'pending'
      });
    } else {
      await db.individualVerifications.update(userId, {
        verification_status: 'pending',
        updated_at: new Date().toISOString()
      });
    }

    const user = await db.users.findById(userId);
    if (user) {
      const existingProfileData = (user.profile_data && typeof user.profile_data === 'object') ? user.profile_data : {};
      const existingVerificationDocs = (existingProfileData.verification_documents && typeof existingProfileData.verification_documents === 'object')
        ? existingProfileData.verification_documents
        : {};

      const nextProfileData = {
        ...existingProfileData,
        verification_documents: {
          ...existingVerificationDocs,
          individual: {
            ...(existingVerificationDocs.individual || {}),
            documents: documents || {},
            submitted_at: new Date().toISOString(),
            status: 'pending'
          }
        }
      };

      await db.users.update(userId, {
        profile_data: nextProfileData,
        verification_status: 'pending'
      });
    }

    return NextResponse.json({
      success: true,
      authUrl: null,
      mode: 'manual',
      message: 'Verification initiated in manual mode. Your uploaded documents will be reviewed by admin.',
      documentType
    });
  } catch (error: any) {
    console.error('Individual verification initiation error:', error);
    return NextResponse.json({
      error: error.message || 'Failed to initiate verification',
      code: 'INITIATION_FAILED'
    }, { status: 500 });
  }
}

async function verifyAadhaar(userId: number, aadhaarNumber: string) {
  // Validate Aadhaar number format
  if (!isValidAadhaarNumber(aadhaarNumber)) {
    return NextResponse.json({ error: 'Invalid Aadhaar number format' }, { status: 400 });
  }

  // Manual verification flow: record provided details and mark submitted checks
  
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
  if (!isValidPANNumber(panNumber)) {
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