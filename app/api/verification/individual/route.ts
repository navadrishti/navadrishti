// API endpoint for individual verification using DigiLocker
import { NextRequest, NextResponse } from 'next/server';
import { DigiLockerService } from '@/lib/digilocker';
import { executeQuery } from '@/lib/db';
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
    const user = await executeQuery({
      query: 'SELECT user_type FROM users WHERE id = ?',
      values: [userId]
    }) as any[];

    if (!user.length || user[0].user_type !== 'individual') {
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
  // Generate DigiLocker authorization URL
  const authUrl = digiLocker.generateAuthUrl(userId, documentType);
  
  // Create or update verification record
  const existingVerification = await executeQuery({
    query: 'SELECT id FROM individual_verifications WHERE user_id = ?',
    values: [userId]
  }) as any[];

  if (existingVerification.length === 0) {
    await executeQuery({
      query: 'INSERT INTO individual_verifications (user_id, verification_status) VALUES (?, ?)',
      values: [userId, 'pending']
    });
  }

  return NextResponse.json({
    success: true,
    authUrl,
    message: 'Please complete verification on DigiLocker'
  });
}

async function verifyAadhaar(userId: number, aadhaarNumber: string) {
  // Validate Aadhaar number format
  if (!digiLocker.validateAadhaarNumber(aadhaarNumber)) {
    return NextResponse.json({ error: 'Invalid Aadhaar number format' }, { status: 400 });
  }

  // In a real implementation, you would use the DigiLocker token to fetch data
  // For now, we'll simulate the verification process
  
  await executeQuery({
    query: `UPDATE individual_verifications 
     SET aadhaar_number = ?, aadhaar_verified = ?, aadhaar_verification_date = NOW(),
         verification_status = CASE 
           WHEN pan_verified = TRUE THEN 'verified' 
           ELSE 'pending' 
         END
     WHERE user_id = ?`,
    values: [aadhaarNumber, true, userId]
  });

  // Update user verification status
  await executeQuery({
    query: 'UPDATE users SET verification_status = ? WHERE id = ?',
    values: ['pending', userId]
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

  await executeQuery({
    query: `UPDATE individual_verifications 
     SET pan_number = ?, pan_verified = ?, pan_verification_date = NOW(),
         verification_status = CASE 
           WHEN aadhaar_verified = TRUE THEN 'verified' 
           ELSE 'pending' 
         END
     WHERE user_id = ?`,
    values: [panNumber, true, userId]
  });

  // Check if both documents are verified
  const verification = await executeQuery({
    query: 'SELECT aadhaar_verified, pan_verified FROM individual_verifications WHERE user_id = ?',
    values: [userId]
  }) as any[];

  if (verification.length && verification[0].aadhaar_verified && verification[0].pan_verified) {
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
    const userCheck = await executeQuery({
      query: 'SELECT id, user_type, verification_status FROM users WHERE id = ?',
      values: [userId]
    }) as any[];

    if (!userCheck.length) {
      console.error('User not found:', userId);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const user = userCheck[0];

    if (user.user_type !== 'individual') {
      console.error('User is not an individual:', user.user_type);
      return NextResponse.json({ error: 'Invalid user type for individual verification' }, { status: 400 });
    }

    // Check if individual_verifications record exists, if not create one
    let verification = await executeQuery({
      query: 'SELECT * FROM individual_verifications WHERE user_id = ?',
      values: [userId]
    }) as any[];

    if (!verification.length) {
      // Create initial verification record
      await executeQuery({
        query: `INSERT INTO individual_verifications (
          user_id, aadhaar_verified, pan_verified, verification_status, created_at
        ) VALUES (?, FALSE, FALSE, 'unverified', NOW())`,
        values: [userId]
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

    const record = verification[0];
    
    return NextResponse.json({
      verified: record.verification_status === 'verified',
      aadhaarVerified: record.aadhaar_verified || false,
      panVerified: record.pan_verified || false,
      status: record.verification_status || 'unverified',
      verifiedAt: record.verification_date,
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