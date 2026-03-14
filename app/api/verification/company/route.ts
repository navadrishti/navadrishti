// API endpoint for Company verification (manual document-first flow)
import { NextRequest, NextResponse } from 'next/server';
import { db, supabase } from '@/lib/db';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '@/lib/auth';

function isValidGSTNumber(gstNumber: string): boolean {
  const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  return gstRegex.test(gstNumber);
}

function isValidCINNumber(cinNumber: string): boolean {
  const cinRegex = /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/;
  return cinRegex.test(cinNumber);
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

    // Verify user is a company
    const user = await db.users.findById(userId);

    if (!user || user.user_type !== 'company') {
      return NextResponse.json({ error: 'Only companies can use this verification method' }, { status: 403 });
    }

    const { action, companyName, gstNumber, panNumber, cinNumber, companyType, documents } = await req.json();

    switch (action) {
      case 'initiate':
        return await initiateCompanyVerification(userId, companyName, cinNumber, companyType, user?.profile_data, documents);
      
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
  companyType: string,
  profileData?: any,
  documents?: Record<string, string>
) {
  try {
    // Create or update verification record
    const { data: existingVerification } = await supabase
      .from('company_verifications')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!existingVerification) {
      await supabase
        .from('company_verifications')
        .insert({
          user_id: userId,
          company_name: companyName,
          cin_number: cinNumber,
          company_type: companyType,
          verification_status: 'pending'
        });
    } else {
      await supabase
        .from('company_verifications')
        .update({
          company_name: companyName,
          cin_number: cinNumber,
          company_type: companyType
        })
        .eq('user_id', userId);
    }

    const existingProfileData = (profileData && typeof profileData === 'object') ? profileData : {};
    const existingVerificationDocs = (existingProfileData.verification_documents && typeof existingProfileData.verification_documents === 'object')
      ? existingProfileData.verification_documents
      : {};

    await db.users.update(userId, {
      profile_data: {
        ...existingProfileData,
        verification_documents: {
          ...existingVerificationDocs,
          company: {
            ...(existingVerificationDocs.company || {}),
            documents: documents || {},
            submitted_at: new Date().toISOString(),
            status: 'pending'
          }
        }
      },
      verification_status: 'pending'
    });

    return NextResponse.json({
      success: true,
      authUrl: null,
      mode: 'manual',
      message: 'Verification initiated in manual mode. Your uploaded documents will be reviewed by admin.'
    });
  } catch (error: any) {
    console.error('Company verification initiation error:', error);
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

  await supabase
    .from('company_verifications')
    .update({
      gst_number: gstNumber,
      gst_verified: true,
      gst_verification_date: new Date().toISOString()
    })
    .eq('user_id', userId);

  // Check verification completion
  await checkCompanyVerificationCompletion(userId);

  return NextResponse.json({
    success: true,
    message: 'GST verification completed'
  });
}

async function verifyCompanyPAN(userId: number, panNumber: string) {
  // Validate PAN number format
  if (!isValidPANNumber(panNumber)) {
    return NextResponse.json({ error: 'Invalid PAN number format' }, { status: 400 });
  }

  await supabase
    .from('company_verifications')
    .update({
      pan_number: panNumber,
      pan_verified: true,
      pan_verification_date: new Date().toISOString()
    })
    .eq('user_id', userId);

  // Check verification completion
  await checkCompanyVerificationCompletion(userId);

  return NextResponse.json({
    success: true,
    message: 'PAN verification completed'
  });
}

async function verifyCIN(userId: number, cinNumber: string) {
  // Validate CIN number format
  if (!isValidCINNumber(cinNumber)) {
    return NextResponse.json({ error: 'Invalid CIN number format' }, { status: 400 });
  }

  await supabase
    .from('company_verifications')
    .update({ cin_number: cinNumber })
    .eq('user_id', userId);

  return NextResponse.json({
    success: true,
    message: 'CIN updated successfully'
  });
}

async function checkCompanyVerificationCompletion(userId: number) {
  // Check if both GST and PAN are verified
  const { data: verification } = await supabase
    .from('company_verifications')
    .select('gst_verified, pan_verified')
    .eq('user_id', userId)
    .single();

  if (verification?.gst_verified && verification?.pan_verified) {
    await supabase
      .from('company_verifications')
      .update({ verification_status: 'verified' })
      .eq('user_id', userId);

    await supabase
      .from('users')
      .update({
        verification_status: 'verified',
        verified_at: new Date().toISOString(),
        verification_level: 'advanced'
      })
      .eq('id', userId);
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