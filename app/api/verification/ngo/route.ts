// API endpoint for NGO verification using EntityLocker
import { NextRequest, NextResponse } from 'next/server';
import { EntityLockerService } from '@/lib/entitylocker';
import { executeQuery } from '@/lib/db';
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
    const user = await executeQuery({
      query: 'SELECT user_type FROM users WHERE id = ?',
      values: [userId]
    }) as any[];

    if (!user.length || user[0].user_type !== 'ngo') {
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
  // Generate EntityLocker authorization URL
  const authUrl = entityLocker.generateAuthUrl(userId, 'ngo');
  
  // Create or update verification record
  const existingVerification = await executeQuery({
    query: 'SELECT id FROM ngo_verifications WHERE user_id = ?',
    values: [userId]
  }) as any[];

  if (existingVerification.length === 0) {
    await executeQuery({
      query: `INSERT INTO ngo_verifications 
              (user_id, organization_name, registration_number, registration_type, verification_status) 
              VALUES (?, ?, ?, ?, ?)`,
      values: [userId, organizationName, registrationNumber, registrationType, 'pending']
    });
  } else {
    await executeQuery({
      query: `UPDATE ngo_verifications 
              SET organization_name = ?, registration_number = ?, registration_type = ? 
              WHERE user_id = ?`,
      values: [organizationName, registrationNumber, registrationType, userId]
    });
  }

  return NextResponse.json({
    success: true,
    authUrl,
    message: 'Please complete verification on EntityLocker'
  });
}

async function verifyGST(userId: number, gstNumber: string) {
  // Validate GST number format
  if (!entityLocker.validateGSTNumber(gstNumber)) {
    return NextResponse.json({ error: 'Invalid GST number format' }, { status: 400 });
  }

  // In a real implementation, you would use the EntityLocker token to fetch data
  // For now, we'll simulate the verification process
  
  await executeQuery({
    query: `UPDATE ngo_verifications 
     SET gst_number = ?, gst_verified = ?, gst_verification_date = NOW(),
         verification_status = CASE 
           WHEN pan_verified = TRUE THEN 'verified' 
           ELSE 'pending' 
         END
     WHERE user_id = ?`,
    values: [gstNumber, true, userId]
  });

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

  await executeQuery({
    query: `UPDATE ngo_verifications 
     SET pan_number = ?, pan_verified = ?, pan_verification_date = NOW(),
         verification_status = CASE 
           WHEN gst_verified = TRUE THEN 'verified' 
           ELSE 'pending' 
         END
     WHERE user_id = ?`,
    values: [panNumber, true, userId]
  });

  // Check if both documents are verified
  const verification = await executeQuery({
    query: 'SELECT gst_verified, pan_verified FROM ngo_verifications WHERE user_id = ?',
    values: [userId]
  }) as any[];

  if (verification.length && verification[0].gst_verified && verification[0].pan_verified) {
    await executeQuery({
      query: 'UPDATE users SET verification_status = ?, verified_at = NOW(), verification_level = ? WHERE id = ?',
      values: ['verified', 'advanced', userId]
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const userId = decoded.id; // Changed from decoded.userId to decoded.id

    // Validate userId
    if (!userId) {
      return NextResponse.json({ error: 'Invalid token: missing user ID' }, { status: 401 });
    }

    // Get verification status
    const verification = await executeQuery({
      query: `SELECT nv.*, u.verification_status, u.verified_at, u.verification_level
       FROM ngo_verifications nv
       JOIN users u ON nv.user_id = u.id
       WHERE nv.user_id = ?`,
      values: [userId]
    }) as any[];

    if (!verification.length) {
      return NextResponse.json({
        verified: false,
        gstVerified: false,
        panVerified: false,
        status: 'unverified'
      });
    }

    const record = verification[0];
    return NextResponse.json({
      verified: record.verification_status === 'verified',
      gstVerified: record.gst_verified || false,
      panVerified: record.pan_verified || false,
      organizationName: record.organization_name,
      registrationNumber: record.registration_number,
      registrationType: record.registration_type,
      status: record.verification_status,
      verifiedAt: record.verified_at,
      level: record.verification_level
    });
  } catch (error) {
    console.error('Get NGO verification status error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}