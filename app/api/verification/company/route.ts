// API endpoint for Company verification using EntityLocker
import { NextRequest, NextResponse } from 'next/server';
import { EntityLockerService } from '@/lib/entitylocker';
import { executeQuery } from '@/lib/db';
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

    // Verify user is a company
    const user = await executeQuery({
      query: 'SELECT user_type FROM users WHERE id = ?',
      values: [userId]
    }) as any[];

    if (!user.length || user[0].user_type !== 'company') {
      return NextResponse.json({ error: 'Only companies can use this verification method' }, { status: 403 });
    }

    const { action, companyName, gstNumber, panNumber, cinNumber, companyType } = await req.json();

    switch (action) {
      case 'initiate':
        return await initiateCompanyVerification(userId, companyName, cinNumber, companyType);
      
      case 'verify-gst':
        return await verifyGST(userId, gstNumber);
      
      case 'verify-pan':
        return await verifyCompanyPAN(userId, panNumber);
      
      case 'verify-cin':
        return await verifyCIN(userId, cinNumber);
      
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Company verification error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function initiateCompanyVerification(
  userId: number, 
  companyName: string, 
  cinNumber: string, 
  companyType: string
) {
  // Generate EntityLocker authorization URL
  const authUrl = entityLocker.generateAuthUrl(userId, 'company');
  
  // Create or update verification record
  const existingVerification = await executeQuery({
    query: 'SELECT id FROM company_verifications WHERE user_id = ?',
    values: [userId]
  }) as any[];

  if (existingVerification.length === 0) {
    await executeQuery({
      query: `INSERT INTO company_verifications 
              (user_id, company_name, cin_number, company_type, verification_status) 
              VALUES (?, ?, ?, ?, ?)`,
      values: [userId, companyName, cinNumber, companyType, 'pending']
    });
  } else {
    await executeQuery({
      query: `UPDATE company_verifications 
              SET company_name = ?, cin_number = ?, company_type = ? 
              WHERE user_id = ?`,
      values: [companyName, cinNumber, companyType, userId]
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

  await executeQuery({
    query: `UPDATE company_verifications 
     SET gst_number = ?, gst_verified = ?, gst_verification_date = NOW()
     WHERE user_id = ?`,
    values: [gstNumber, true, userId]
  });

  // Check verification completion
  await checkCompanyVerificationCompletion(userId);

  return NextResponse.json({
    success: true,
    message: 'GST verification completed'
  });
}

async function verifyCompanyPAN(userId: number, panNumber: string) {
  // Validate PAN number format
  const digiLockerService = new (require('@/lib/digilocker').DigiLockerService)();
  if (!digiLockerService.validatePANNumber(panNumber)) {
    return NextResponse.json({ error: 'Invalid PAN number format' }, { status: 400 });
  }

  await executeQuery({
    query: `UPDATE company_verifications 
     SET pan_number = ?, pan_verified = ?, pan_verification_date = NOW()
     WHERE user_id = ?`,
    values: [panNumber, true, userId]
  });

  // Check verification completion
  await checkCompanyVerificationCompletion(userId);

  return NextResponse.json({
    success: true,
    message: 'PAN verification completed'
  });
}

async function verifyCIN(userId: number, cinNumber: string) {
  // Validate CIN number format
  if (!entityLocker.validateCINNumber(cinNumber)) {
    return NextResponse.json({ error: 'Invalid CIN number format' }, { status: 400 });
  }

  await executeQuery({
    query: `UPDATE company_verifications 
     SET cin_number = ?
     WHERE user_id = ?`,
    values: [cinNumber, userId]
  });

  return NextResponse.json({
    success: true,
    message: 'CIN updated successfully'
  });
}

async function checkCompanyVerificationCompletion(userId: number) {
  // Check if both GST and PAN are verified
  const verification = await executeQuery({
    query: 'SELECT gst_verified, pan_verified FROM company_verifications WHERE user_id = ?',
    values: [userId]
  }) as any[];

  if (verification.length && verification[0].gst_verified && verification[0].pan_verified) {
    await executeQuery({
      query: `UPDATE company_verifications 
               SET verification_status = 'verified' 
               WHERE user_id = ?`,
      values: [userId]
    });

    await executeQuery({
      query: 'UPDATE users SET verification_status = ?, verified_at = NOW(), verification_level = ? WHERE id = ?',
      values: ['verified', 'advanced', userId]
    });
  }
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
    const { data: verification, error: verificationError } = await supabase
      .from('company_verifications')    
      .select(`
        *,
        users!inner(verification_status, verified_at, verification_level)
      `)
      .eq('user_id', userId);

    if (verificationError) {
      console.error('Error fetching company verification:', verificationError);
      return NextResponse.json({ error: 'Failed to fetch verification status' }, { status: 500 });
    }

    if (!verification || verification.length === 0) {
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
      companyName: record.company_name,
      cinNumber: record.cin_number,
      companyType: record.company_type,
      status: record.verification_status,
      verifiedAt: record.verified_at,
      level: record.verification_level
    });
  } catch (error) {
    console.error('Get company verification status error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}