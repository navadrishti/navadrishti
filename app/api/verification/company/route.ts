// API endpoint for Company verification (manual document-first flow)
import { NextRequest, NextResponse } from 'next/server';
import { db, supabase } from '@/lib/db';
import jwt from 'jsonwebtoken';
import { JWT_SECRET, requireBankStatementDocument } from '@/lib/auth';

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
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('user_type')
      .eq('id', userId)
      .single();

    if (userError || !user || user.user_type !== 'company') {
      return NextResponse.json({ error: 'Only companies can use this verification method' }, { status: 403 });
    }

    const { action, companyName, gstNumber, panNumber, cinNumber, companyType, registrationNumber, documents } = await req.json();

    switch (action) {
      case 'initiate': {
        const bankStatementError = requireBankStatementDocument(documents);
        if (bankStatementError) return bankStatementError;
        return await initiateCompanyVerification(userId, companyName, cinNumber, companyType, documents, panNumber, gstNumber, registrationNumber);
      }

      case 'reverify': {
        const bankStatementError = requireBankStatementDocument(documents);
        if (bankStatementError) return bankStatementError;
        return await reverifyCompanyVerification(userId, companyName, cinNumber, companyType, documents, panNumber, gstNumber, registrationNumber);
      }
      
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
  documents?: Record<string, string>,
  panNumber?: string,
  gstNumber?: string,
  registrationNumber?: string
) {
  try {
    const entered = {
      pan: typeof panNumber === 'string' ? panNumber.trim().toUpperCase() : '',
      gst: typeof gstNumber === 'string' ? gstNumber.trim().toUpperCase() : '',
      cin: typeof cinNumber === 'string' ? cinNumber.trim().toUpperCase() : '',
      registration_number: typeof registrationNumber === 'string' ? registrationNumber.trim() : '',
      company_type: companyType || '',
    };

    const verificationPayload: Record<string, any> = {
      company_name: companyName,
      verification_status: 'pending',
    };
    if (entered.gst) verificationPayload.gst_number = entered.gst;
    if (entered.registration_number) verificationPayload.registration_number = entered.registration_number;

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
          ...verificationPayload
        });
    } else {
      await supabase
        .from('company_verifications')
        .update(verificationPayload)
        .eq('user_id', userId);
    }

    const { data: userRow } = await supabase
      .from('users')
      .select('profile_data')
      .eq('id', userId)
      .single();

    const existingProfileData = (userRow?.profile_data && typeof userRow.profile_data === 'object')
      ? userRow.profile_data
      : {};
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
          company: {
            ...(existingVerificationDocs.company || {}),
            documents: documents || {},
            entered_fields: entered,
            submitted_at: new Date().toISOString(),
            status: 'pending'
          }
        }
      },
      verification_status: 'pending'
      })
      .eq('id', userId);

    await db.verificationDocuments.syncActorDocuments({
      userId,
      actorType: 'company',
      documents: documents || {},
      numbers: {
        gst: entered?.gst_number || null,
        cin: entered?.registration_number || entered?.cin || null,
        pan: entered?.pan_number || null,
      },
      status: 'under_review',
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

async function reverifyCompanyVerification(
  userId: number,
  companyName: string,
  cinNumber: string,
  companyType: string,
  documents?: Record<string, string>,
  panNumber?: string,
  gstNumber?: string,
  registrationNumber?: string
) {
  try {
    const { data: userRow, error: userError } = await supabase
      .from('users')
      .select('verification_status, profile_data')
      .eq('id', userId)
      .single();

    if (userError || !userRow || userRow.verification_status !== 'verified') {
      return NextResponse.json({ error: 'Only verified users can request reverification' }, { status: 400 });
    }

    const { data: existingVerification } = await supabase
      .from('company_verifications')
      .select('verification_status')
      .eq('user_id', userId)
      .single();

    if (!existingVerification || existingVerification.verification_status !== 'verified') {
      return NextResponse.json({ error: 'Only verified users can request reverification' }, { status: 400 });
    }

    const existingProfileData = (userRow.profile_data && typeof userRow.profile_data === 'object')
      ? userRow.profile_data
      : {};
    const existingVerificationDocs = (existingProfileData.verification_documents && typeof existingProfileData.verification_documents === 'object')
      ? existingProfileData.verification_documents
      : {};

    const entered = {
      pan: typeof panNumber === 'string' ? panNumber.trim().toUpperCase() : '',
      gst: typeof gstNumber === 'string' ? gstNumber.trim().toUpperCase() : '',
      cin: typeof cinNumber === 'string' ? cinNumber.trim().toUpperCase() : '',
      registration_number: typeof registrationNumber === 'string' ? registrationNumber.trim() : '',
      company_type: companyType || '',
    };

    await supabase
      .from('company_verifications')
      .update({
        company_name: companyName,
        ...(entered.gst ? { gst_number: entered.gst } : {}),
        ...(entered.registration_number ? { registration_number: entered.registration_number } : {}),
      })
      .eq('user_id', userId);

    await supabase
      .from('users')
      .update({
        profile_data: {
          ...existingProfileData,
          reverification_pending: true,
          verification_documents: {
            ...existingVerificationDocs,
            company: {
              ...(existingVerificationDocs.company || {}),
              reverification_status: 'pending',
              reverification_documents: documents || {},
              reverification_submitted_at: new Date().toISOString(),
              entered_fields: entered,
            },
          },
        },
      })
      .eq('id', userId);

    return NextResponse.json({
      success: true,
      mode: 'reverification',
      message: 'Reverification submitted. You remain verified while your updated documents are reviewed.',
    });
  } catch (error: any) {
    console.error('Company reverification error:', error);
    return NextResponse.json({
      error: error.message || 'Failed to submit reverification',
      code: 'REVERIFICATION_FAILED',
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
    })
    .eq('user_id', userId);

  return NextResponse.json({
    success: true,
    message: 'GST verification completed'
  });
}

async function verifyCompanyPAN(userId: number, panNumber: string) {
  if (!isValidPANNumber(panNumber)) {
    return NextResponse.json({ error: 'Invalid PAN number format' }, { status: 400 });
  }

  const { data: userRow } = await supabase
    .from('users')
    .select('profile_data')
    .eq('id', userId)
    .single();

  const existingProfileData = (userRow?.profile_data && typeof userRow.profile_data === 'object')
    ? userRow.profile_data
    : {};
  const existingVerificationDocs = (existingProfileData.verification_documents && typeof existingProfileData.verification_documents === 'object')
    ? existingProfileData.verification_documents
    : {};
  const companyBlock = (existingVerificationDocs.company && typeof existingVerificationDocs.company === 'object')
    ? existingVerificationDocs.company
    : {};
  const enteredFields = (companyBlock.entered_fields && typeof companyBlock.entered_fields === 'object')
    ? companyBlock.entered_fields
    : {};

  await supabase
    .from('users')
    .update({
      profile_data: {
        ...existingProfileData,
        verification_documents: {
          ...existingVerificationDocs,
          company: {
            ...companyBlock,
            entered_fields: {
              ...enteredFields,
              pan: panNumber,
            },
          },
        },
      },
    })
    .eq('id', userId);

  return NextResponse.json({
    success: true,
    message: 'PAN verification completed'
  });
}

async function verifyCIN(userId: number, cinNumber: string) {
  if (!isValidCINNumber(cinNumber)) {
    return NextResponse.json({ error: 'Invalid CIN number format' }, { status: 400 });
  }

  const { data: userRow } = await supabase
    .from('users')
    .select('profile_data')
    .eq('id', userId)
    .single();

  const existingProfileData = (userRow?.profile_data && typeof userRow.profile_data === 'object')
    ? userRow.profile_data
    : {};
  const existingVerificationDocs = (existingProfileData.verification_documents && typeof existingProfileData.verification_documents === 'object')
    ? existingProfileData.verification_documents
    : {};
  const companyBlock = (existingVerificationDocs.company && typeof existingVerificationDocs.company === 'object')
    ? existingVerificationDocs.company
    : {};
  const enteredFields = (companyBlock.entered_fields && typeof companyBlock.entered_fields === 'object')
    ? companyBlock.entered_fields
    : {};

  await supabase
    .from('users')
    .update({
      profile_data: {
        ...existingProfileData,
        verification_documents: {
          ...existingVerificationDocs,
          company: {
            ...companyBlock,
            entered_fields: {
              ...enteredFields,
              cin: cinNumber,
            },
          },
        },
      },
    })
    .eq('id', userId);

  return NextResponse.json({
    success: true,
    message: 'CIN updated successfully'
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
    const { data: userRow } = await supabase
      .from('users')
      .select('verification_status, profile_data')
      .eq('id', userId)
      .single();

    const profileData = (userRow?.profile_data && typeof userRow.profile_data === 'object')
      ? userRow.profile_data
      : {};
    // users.verification_status is the admin override — if admin explicitly downgraded,
    // that wins regardless of what the company_verifications table says.
    const adminStatus = String(userRow?.verification_status || '').trim().toLowerCase();
    const effectiveStatus = (adminStatus === 'unverified' || adminStatus === 'suspended' || adminStatus === 'pending')
      ? adminStatus
      : adminStatus === 'verified'
        ? 'verified'
        : (record.verification_status || 'unverified');

    return NextResponse.json({
      verified: effectiveStatus === 'verified',
      gstVerified: record.gst_verified || false,
      panVerified: record.pan_verified || false,
      companyName: record.company_name,
      cinNumber: record.cin_number,
      companyType: record.company_type,
      status: effectiveStatus,
      verification_status: effectiveStatus,
      reverification_pending: Boolean(profileData.reverification_pending),
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