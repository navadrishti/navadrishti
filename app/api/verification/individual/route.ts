// API endpoint for individual verification (manual document-first flow)
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenClaims, requireBankStatementDocument } from '@/lib/auth';
import { getErrorMessage, parseJsonObject } from '@/lib/utils';
import type { TablesUpdate } from '@/lib/database.types';

export async function POST(req: NextRequest) {
  try {
    const claims = getTokenClaims(req);
    if (!claims) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = claims.id;

    if (!userId) {
      return NextResponse.json({ error: 'Invalid token: missing user ID' }, { status: 401 });
    }

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
      case 'initiate': {
        const bankStatementError = requireBankStatementDocument(documents);
        if (bankStatementError) return bankStatementError;
        return await initiateVerification(userId, documentType, documents, aadhaarNumber, panNumber);
      }

      case 'reverify': {
        const bankStatementError = requireBankStatementDocument(documents);
        if (bankStatementError) return bankStatementError;
        return await reverifyVerification(userId, documentType, documents, aadhaarNumber, panNumber);
      }
      
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

async function initiateVerification(
  userId: number,
  documentType: 'aadhaar' | 'pan',
  documents?: Record<string, string>,
  aadhaarNumber?: string,
  panNumber?: string
) {
  try {
    const entered = {
      aadhaar: typeof aadhaarNumber === 'string' ? aadhaarNumber.replace(/\s/g, '') : '',
      pan: typeof panNumber === 'string' ? panNumber.trim().toUpperCase() : '',
    };

    const existingVerification = await db.individualVerifications.findByUserId(userId);

    const verificationPayload: TablesUpdate<'individual_verifications'> = {
      verification_status: 'pending',
      updated_at: new Date().toISOString(),
      aadhaar_verified: false,
      pan_verified: false,
    };
    if (entered.aadhaar) verificationPayload.aadhaar_number = entered.aadhaar;
    if (entered.pan) verificationPayload.pan_number = entered.pan;

    if (!existingVerification) {
      await db.individualVerifications.create({
        user_id: userId,
        ...verificationPayload,
      });
    } else {
      await db.individualVerifications.update(userId, verificationPayload);
    }

    const user = await db.users.findById(userId);
    if (user) {
      const existingProfileData = parseJsonObject(user.profile_data);
      const existingVerificationDocs = parseJsonObject(existingProfileData.verification_documents);

      const nextProfileData = {
        ...existingProfileData,
        verification_documents: {
          ...existingVerificationDocs,
          individual: {
            ...(existingVerificationDocs.individual || {}),
            documents: documents || {},
            entered_fields: entered,
            submitted_at: new Date().toISOString(),
            status: 'pending'
          }
        }
      };

      await db.users.update(userId, {
        profile_data: nextProfileData,
        verification_status: 'pending'
      });

      await db.verificationDocuments.syncActorDocuments({
        userId,
        actorType: 'individual',
        documents: documents || {},
        numbers: {
          aadhaar: entered?.aadhaar || null,
          pan: entered?.pan || null,
        },
        status: 'under_review',
      });
    }

    return NextResponse.json({
      success: true,
      authUrl: null,
      mode: 'manual',
      message: 'Verification initiated in manual mode. Your uploaded documents will be reviewed by a CA.',
      documentType
    });
  } catch (error) {
    console.error('Individual verification initiation error:', error);
    return NextResponse.json({
      error: getErrorMessage(error) || 'Failed to initiate verification',
      code: 'INITIATION_FAILED'
    }, { status: 500 });
  }
}

async function reverifyVerification(
  userId: number,
  documentType: 'aadhaar' | 'pan',
  documents?: Record<string, string>,
  aadhaarNumber?: string,
  panNumber?: string
) {
  try {
    const user = await db.users.findById(userId);
    if (!user || user.verification_status !== 'verified') {
      return NextResponse.json({ error: 'Only verified users can request reverification' }, { status: 400 });
    }

    const existingVerification = await db.individualVerifications.findByUserId(userId);
    if (!existingVerification || existingVerification.verification_status !== 'verified') {
      return NextResponse.json({ error: 'Only verified users can request reverification' }, { status: 400 });
    }

    const existingProfileData = parseJsonObject(user.profile_data);
    const existingVerificationDocs = parseJsonObject(existingProfileData.verification_documents);

    await db.users.update(userId, {
      profile_data: {
        ...existingProfileData,
        reverification_pending: true,
        verification_documents: {
          ...existingVerificationDocs,
          individual: {
            ...(existingVerificationDocs.individual || {}),
            reverification_status: 'pending',
            reverification_documents: documents || {},
            reverification_submitted_at: new Date().toISOString(),
            entered_fields: {
              aadhaar: typeof aadhaarNumber === 'string' ? aadhaarNumber.replace(/\s/g, '') : '',
              pan: typeof panNumber === 'string' ? panNumber.trim().toUpperCase() : '',
            },
          }
        }
      }
    });

    return NextResponse.json({
      success: true,
      mode: 'reverification',
      message: 'Reverification submitted. You remain verified while your updated documents are reviewed.',
      documentType
    });
  } catch (error) {
    console.error('Individual reverification error:', error);
    return NextResponse.json({
      error: getErrorMessage(error) || 'Failed to submit reverification',
      code: 'REVERIFICATION_FAILED'
    }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const claims = getTokenClaims(req);
    if (!claims) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = claims.id;

    if (!userId) {
      console.error('Invalid token: missing user ID');
      return NextResponse.json({ error: 'Invalid token: missing user ID' }, { status: 401 });
    }

    const user = await db.users.findById(userId);

    if (!user) {
      console.error('User not found:', userId);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.user_type !== 'individual') {
      console.error('User is not an individual:', user.user_type);
      return NextResponse.json({ error: 'Invalid user type for individual verification' }, { status: 400 });
    }

    let verification = await db.individualVerifications.findByUserId(userId);

    if (!verification) {
      verification = await db.individualVerifications.create({
        user_id: userId,
        aadhaar_verified: false,
        pan_verified: false,
        verification_status: 'unverified'
      });

      return NextResponse.json({
        verified: false,
        aadhaarVerified: false,
        panVerified: false,
        status: 'unverified',
        level: 'basic'
      });
    }
    
    const profileData = parseJsonObject(user.profile_data);
    // users.verification_status is the admin override — if admin explicitly downgraded,
    // that wins regardless of what the individual_verifications table says.
    const adminStatus = String(user.verification_status || '').trim().toLowerCase();
    const effectiveStatus = (adminStatus === 'unverified' || adminStatus === 'suspended' || adminStatus === 'pending')
      ? adminStatus
      : adminStatus === 'verified'
        ? 'verified'
        : (verification.verification_status || 'unverified');

    return NextResponse.json({
      verified: effectiveStatus === 'verified',
      aadhaarVerified: verification.aadhaar_verified || false,
      panVerified: verification.pan_verified || false,
      status: effectiveStatus,
      verification_status: effectiveStatus,
      reverification_pending: Boolean(profileData.reverification_pending),
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