// API endpoint for NGO verification (manual document-first flow)
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import jwt from 'jsonwebtoken';
import { JWT_SECRET, getComplianceDocumentUrl, mergeNgoComplianceNumbers, parseSubmittedComplianceNumbers, requireBankStatementDocument, type NgoComplianceNumbers, buildNgoDocumentExpiries, normalizeExpiryDate } from '@/lib/auth';
import { syncActorDocumentsToTable } from '@/lib/verification-documents-db';
function isValidGSTNumber(gstNumber: string): boolean {
  const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  return gstRegex.test(gstNumber);
}

function isValidPANNumber(panNumber: string): boolean {
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
  return panRegex.test(panNumber);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstDocumentUrl(...values: unknown[]): string {
  for (const value of values) {
    const url = getComplianceDocumentUrl(value);
    if (url) return url;
  }
  return '';
}

function requirePairedComplianceCert(number: string, documentUrl: string, label: string): NextResponse | null {
  if (!number || documentUrl) return null;
  return NextResponse.json(
    { error: `${label} certificate is required when the ${label} number is provided.` },
    { status: 400 }
  );
}

function requireNumberWithExpiry(number: string, expiry: string, label: string): NextResponse | null {
  if (number && !expiry) {
    return NextResponse.json(
      { error: `${label} expiry date is required when the ${label} number is provided.` },
      { status: 400 }
    );
  }
  return null;
}

function validateOptionalNgoCertificates(options: {
  existingProfileData: Record<string, unknown>;
  documents?: Record<string, string>;
  complianceDocuments?: Record<string, string>;
  numbers: NgoComplianceNumbers;
  fcraNumber: string;
  fcraExpiry: string;
  twelveAExpiry?: string;
  eightyGExpiry?: string;
  csr1Expiry?: string;
}): NextResponse | null {
  const existingDocs = asRecord(options.existingProfileData.compliance_documents);
  const existingVerification = asRecord(
    asRecord(asRecord(options.existingProfileData.verification_documents).ngo).documents
  );
  const submitted = options.documents || {};
  const compliance = options.complianceDocuments || {};

  const twelveAError = requirePairedComplianceCert(
    options.numbers.twelve_a_number,
    firstDocumentUrl(
      compliance.twelve_a,
      submitted.ngoTwelveACertificate,
      existingDocs.twelve_a,
      existingVerification.ngoTwelveACertificate
    ),
    '12A'
  );
  if (twelveAError) return twelveAError;

  const eightyGError = requirePairedComplianceCert(
    options.numbers.eighty_g_number,
    firstDocumentUrl(
      compliance.eighty_g,
      submitted.ngoEightyGCertificate,
      existingDocs.eighty_g,
      existingVerification.ngoEightyGCertificate
    ),
    '80G'
  );
  if (eightyGError) return eightyGError;

  const csr1Error = requirePairedComplianceCert(
    options.numbers.csr1_registration_number,
    firstDocumentUrl(
      compliance.csr1,
      submitted.ngoCsr1Certificate,
      existingDocs.csr1,
      existingVerification.ngoCsr1Certificate
    ),
    'CSR-1'
  );
  if (csr1Error) return csr1Error;

  const twelveAExpiryError = requireNumberWithExpiry(
    options.numbers.twelve_a_number,
    options.twelveAExpiry || '',
    '12A'
  );
  if (twelveAExpiryError) return twelveAExpiryError;

  const eightyGExpiryError = requireNumberWithExpiry(
    options.numbers.eighty_g_number,
    options.eightyGExpiry || '',
    '80G'
  );
  if (eightyGExpiryError) return eightyGExpiryError;

  const csr1ExpiryError = requireNumberWithExpiry(
    options.numbers.csr1_registration_number,
    options.csr1Expiry || '',
    'CSR-1'
  );
  if (csr1ExpiryError) return csr1ExpiryError;

  const fcraExpiryError = requireNumberWithExpiry(options.fcraNumber, options.fcraExpiry, 'FCRA');
  if (fcraExpiryError) return fcraExpiryError;

  const fcraUrl = firstDocumentUrl(submitted.ngoFcraPhoto, existingVerification.ngoFcraPhoto, existingDocs.fcra);
  if (options.fcraNumber && !fcraUrl) {
    return NextResponse.json(
      { error: 'FCRA registration document is required when the FCRA number is provided.' },
      { status: 400 }
    );
  }

  return null;
}

function resolveComplianceNumbersForSubmission(
  existingProfileData: Record<string, unknown>,
  complianceNumbers: unknown
): { merged: NgoComplianceNumbers; submitted: Partial<NgoComplianceNumbers> } {
  const submitted = parseSubmittedComplianceNumbers(complianceNumbers);
  const merged = mergeNgoComplianceNumbers(existingProfileData, submitted);
  return {
    merged,
    submitted: submitted || {},
  };
}

function mergeSubmittedComplianceDocuments(
  existingComplianceDocuments: Record<string, unknown>,
  complianceDocuments?: Record<string, string>,
  verificationDocuments?: Record<string, string>
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...existingComplianceDocuments };

  if (complianceDocuments && typeof complianceDocuments === 'object') {
    for (const [key, value] of Object.entries(complianceDocuments)) {
      if (key === 'pending_reverification') {
        continue;
      }
      if (typeof value === 'string' && value.trim() && !getComplianceDocumentUrl(next[key])) {
        next[key] = value.trim();
      }
    }
  }

  if (verificationDocuments && typeof verificationDocuments === 'object') {
    const docMap: Record<string, string> = {
      ngoTwelveACertificate: 'twelve_a',
      ngoEightyGCertificate: 'eighty_g',
      ngoCsr1Certificate: 'csr1',
    };

    for (const [verificationKey, complianceKey] of Object.entries(docMap)) {
      const url = verificationDocuments[verificationKey];
      if (typeof url === 'string' && url.trim() && !getComplianceDocumentUrl(next[complianceKey])) {
        next[complianceKey] = url.trim();
      }
    }
  }

  return next;
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
      .select('user_type')
      .eq('id', userId)
      .single();

    if (userError || !user || user.user_type !== 'ngo') {
      return NextResponse.json({ error: 'Only NGOs can use this verification method' }, { status: 403 });
    }

    const {
      action,
      organizationName,
      gstNumber,
      panNumber,
      registrationNumber,
      registrationType,
      documents,
      complianceDocuments,
      complianceNumbers,
      fcraNumber,
      fcraExpiryDate,
      twelveAExpiryDate,
      eightyGExpiryDate,
      csr1ExpiryDate,
    } = await req.json();

    const complianceExpiries = {
      twelveAExpiryDate,
      eightyGExpiryDate,
      csr1ExpiryDate,
    };

    switch (action) {
      case 'initiate': {
        const bankStatementError = requireBankStatementDocument(documents);
        if (bankStatementError) return bankStatementError;
        return await initiateNGOVerification(
          userId,
          organizationName,
          registrationNumber,
          registrationType,
          documents,
          complianceDocuments,
          complianceNumbers,
          panNumber,
          fcraNumber,
          fcraExpiryDate,
          complianceExpiries
        );
      }

      case 'reverify': {
        const bankStatementError = requireBankStatementDocument(documents);
        if (bankStatementError) return bankStatementError;
        return await reverifyNGOVerification(
          userId,
          organizationName,
          registrationNumber,
          registrationType,
          documents,
          complianceDocuments,
          complianceNumbers,
          panNumber,
          fcraNumber,
          fcraExpiryDate,
          complianceExpiries
        );
      }
      
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
  documents?: Record<string, string>,
  complianceDocuments?: Record<string, string>,
  complianceNumbers?: unknown,
  panNumber?: string,
  fcraNumber?: string,
  fcraExpiryDate?: string,
  complianceExpiries?: {
    twelveAExpiryDate?: string;
    eightyGExpiryDate?: string;
    csr1ExpiryDate?: string;
  }
) {
  try {
    const { data: userRow } = await supabase
      .from('users')
      .select('profile_data')
      .eq('id', userId)
      .single();

    const existingProfileData = (userRow?.profile_data && typeof userRow.profile_data === 'object')
      ? userRow.profile_data
      : {};

    const resolvedComplianceNumbers = resolveComplianceNumbersForSubmission(
      existingProfileData,
      complianceNumbers
    );

    const { merged: mergedComplianceNumbers, submitted: submittedComplianceNumbers } =
      resolvedComplianceNumbers;

    const fcraNumberText = typeof fcraNumber === 'string' ? fcraNumber.trim() : '';
    const fcraExpiryText = normalizeExpiryDate(fcraExpiryDate) || '';
    const optionalCertError = validateOptionalNgoCertificates({
      existingProfileData,
      documents,
      complianceDocuments,
      numbers: mergedComplianceNumbers,
      fcraNumber: fcraNumberText,
      fcraExpiry: fcraExpiryText,
      twelveAExpiry: normalizeExpiryDate(complianceExpiries?.twelveAExpiryDate) || '',
      eightyGExpiry: normalizeExpiryDate(complianceExpiries?.eightyGExpiryDate) || '',
      csr1Expiry: normalizeExpiryDate(complianceExpiries?.csr1ExpiryDate) || '',
    });
    if (optionalCertError) return optionalCertError;

    const submittedAt = new Date().toISOString();
    const entered = {
      pan: typeof panNumber === 'string' ? panNumber.trim().toUpperCase() : '',
      fcra_number: typeof fcraNumber === 'string' ? fcraNumber.trim() : '',
      fcra_expiry: normalizeExpiryDate(fcraExpiryDate) || '',
      registration_number: registrationNumber,
      twelve_a: mergedComplianceNumbers.twelve_a_number,
      eighty_g: mergedComplianceNumbers.eighty_g_number,
      csr1: mergedComplianceNumbers.csr1_registration_number,
      twelve_a_expiry: normalizeExpiryDate(complianceExpiries?.twelveAExpiryDate) || '',
      eighty_g_expiry: normalizeExpiryDate(complianceExpiries?.eightyGExpiryDate) || '',
      csr1_expiry: normalizeExpiryDate(complianceExpiries?.csr1ExpiryDate) || '',
    };

    const documentExpiries = buildNgoDocumentExpiries({
      profileData: existingProfileData,
      enteredFields: entered,
      documents: {
        ...(documents || {}),
        bankStatement: documents?.bankStatement,
      },
      submittedAt,
    });

    const ngoPayload: Record<string, any> = {
      ngo_name: organizationName,
      registration_number: registrationNumber,
      registration_type: registrationType,
      verification_status: 'pending',
    };
    if (entered.fcra_number) ngoPayload.fcra_number = entered.fcra_number;

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
          ...ngoPayload
        });
    } else {
      await supabase
        .from('ngo_verifications')
        .update(ngoPayload)
        .eq('user_id', userId);
    }

    const existingVerificationDocs = (existingProfileData.verification_documents && typeof existingProfileData.verification_documents === 'object')
      ? existingProfileData.verification_documents
      : {};
    const existingComplianceDocuments =
      existingProfileData.compliance_documents && typeof existingProfileData.compliance_documents === 'object'
        ? existingProfileData.compliance_documents
        : {};
    const nextComplianceDocuments = mergeSubmittedComplianceDocuments(
      existingComplianceDocuments,
      complianceDocuments,
      documents
    );

    await supabase
      .from('users')
      .update({
        profile_data: {
          ...existingProfileData,
          twelve_a_number: mergedComplianceNumbers.twelve_a_number,
          eighty_g_number: mergedComplianceNumbers.eighty_g_number,
          csr1_registration_number: mergedComplianceNumbers.csr1_registration_number,
          fcra_expiry_date: entered.fcra_expiry || existingProfileData.fcra_expiry_date || null,
          document_expiries: documentExpiries,
          document_expiry_unverified_at: null,
          document_expiry_unverified_docs: null,
          compliance_documents: nextComplianceDocuments,
          verification_documents: {
            ...existingVerificationDocs,
            ngo: {
              ...(existingVerificationDocs.ngo || {}),
              documents: documents || {},
              entered_fields: entered,
              compliance_numbers: submittedComplianceNumbers,
              submitted_at: submittedAt,
              status: 'pending'
            }
          }
        },
        verification_status: 'pending'
      })
      .eq('id', userId);

    await syncActorDocumentsToTable({
      userId,
      actorType: 'ngo',
      documents: documents || {},
      numbers: {
        twelve_a: mergedComplianceNumbers.twelve_a_number,
        eighty_g: mergedComplianceNumbers.eighty_g_number,
        csr1: mergedComplianceNumbers.csr1_registration_number,
        fcra: entered.fcra_number || existingProfileData.fcra_number || null,
      },
      expiries: {
        twelve_a: entered.twelve_a_expiry || null,
        eighty_g: entered.eighty_g_expiry || null,
        csr1: entered.csr1_expiry || null,
        fcra: entered.fcra_expiry || existingProfileData.fcra_expiry_date || null,
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
    console.error('NGO verification initiation error:', error);
    return NextResponse.json({
      error: error.message || 'Failed to initiate verification',
      code: 'INITIATION_FAILED'
    }, { status: 500 });
  }
}

async function reverifyNGOVerification(
  userId: number,
  organizationName: string,
  registrationNumber: string,
  registrationType: string,
  documents?: Record<string, string>,
  complianceDocuments?: Record<string, string>,
  complianceNumbers?: unknown,
  panNumber?: string,
  fcraNumber?: string,
  fcraExpiryDate?: string,
  complianceExpiries?: {
    twelveAExpiryDate?: string;
    eightyGExpiryDate?: string;
    csr1ExpiryDate?: string;
  }
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

    const existingProfileData = (userRow.profile_data && typeof userRow.profile_data === 'object')
      ? userRow.profile_data
      : {};

    const resolvedComplianceNumbers = resolveComplianceNumbersForSubmission(
      existingProfileData,
      complianceNumbers
    );

    const { merged: mergedComplianceNumbers, submitted: submittedComplianceNumbers } =
      resolvedComplianceNumbers;

    const fcraNumberText = typeof fcraNumber === 'string' ? fcraNumber.trim() : '';
    const fcraExpiryText = normalizeExpiryDate(fcraExpiryDate) || '';
    const optionalCertError = validateOptionalNgoCertificates({
      existingProfileData,
      documents,
      complianceDocuments,
      numbers: mergedComplianceNumbers,
      fcraNumber: fcraNumberText,
      fcraExpiry: fcraExpiryText,
      twelveAExpiry: normalizeExpiryDate(complianceExpiries?.twelveAExpiryDate) || '',
      eightyGExpiry: normalizeExpiryDate(complianceExpiries?.eightyGExpiryDate) || '',
      csr1Expiry: normalizeExpiryDate(complianceExpiries?.csr1ExpiryDate) || '',
    });
    if (optionalCertError) return optionalCertError;

    const { data: existingVerification } = await supabase
      .from('ngo_verifications')
      .select('verification_status')
      .eq('user_id', userId)
      .single();

    if (!existingVerification || existingVerification.verification_status !== 'verified') {
      return NextResponse.json({ error: 'Only verified users can request reverification' }, { status: 400 });
    }

    const submittedAt = new Date().toISOString();
    const entered = {
      pan: typeof panNumber === 'string' ? panNumber.trim().toUpperCase() : '',
      fcra_number: typeof fcraNumber === 'string' ? fcraNumber.trim() : '',
      fcra_expiry: normalizeExpiryDate(fcraExpiryDate) || '',
      registration_number: registrationNumber,
      twelve_a: mergedComplianceNumbers.twelve_a_number,
      eighty_g: mergedComplianceNumbers.eighty_g_number,
      csr1: mergedComplianceNumbers.csr1_registration_number,
      twelve_a_expiry: normalizeExpiryDate(complianceExpiries?.twelveAExpiryDate) || '',
      eighty_g_expiry: normalizeExpiryDate(complianceExpiries?.eightyGExpiryDate) || '',
      csr1_expiry: normalizeExpiryDate(complianceExpiries?.csr1ExpiryDate) || '',
    };

    const documentExpiries = buildNgoDocumentExpiries({
      profileData: existingProfileData,
      enteredFields: entered,
      documents: {
        ...(documents || {}),
        bankStatement: documents?.bankStatement,
      },
      submittedAt,
    });

    const existingVerificationDocs = (existingProfileData.verification_documents && typeof existingProfileData.verification_documents === 'object')
      ? existingProfileData.verification_documents
      : {};
    const existingComplianceDocuments =
      existingProfileData.compliance_documents && typeof existingProfileData.compliance_documents === 'object'
        ? existingProfileData.compliance_documents
        : {};
    const pendingComplianceDocuments =
      complianceDocuments && typeof complianceDocuments === 'object'
        ? Object.fromEntries(
            Object.entries(complianceDocuments).filter(([, value]) => typeof value === 'string' && value.trim())
          )
        : {};

    await supabase
      .from('ngo_verifications')
      .update({
        ngo_name: organizationName,
        registration_number: registrationNumber,
        registration_type: registrationType,
        ...(typeof fcraNumber === 'string' && fcraNumber.trim() ? { fcra_number: fcraNumber.trim() } : {}),
      })
      .eq('user_id', userId);

    await supabase
      .from('users')
      .update({
        profile_data: {
          ...existingProfileData,
          twelve_a_number: mergedComplianceNumbers.twelve_a_number,
          eighty_g_number: mergedComplianceNumbers.eighty_g_number,
          csr1_registration_number: mergedComplianceNumbers.csr1_registration_number,
          fcra_expiry_date: entered.fcra_expiry || existingProfileData.fcra_expiry_date || null,
          document_expiries: documentExpiries,
          reverification_pending: true,
          compliance_documents: {
            ...existingComplianceDocuments,
            ...(Object.keys(pendingComplianceDocuments).length > 0
              ? { pending_reverification: pendingComplianceDocuments }
              : {}),
          },
          verification_documents: {
            ...existingVerificationDocs,
            ngo: {
              ...(existingVerificationDocs.ngo || {}),
              reverification_status: 'pending',
              reverification_documents: documents || {},
              reverification_compliance_numbers: submittedComplianceNumbers,
              reverification_submitted_at: submittedAt,
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
    console.error('NGO reverification error:', error);
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

    const { data: userRow } = await supabase
      .from('users')
      .select('verification_status, profile_data')
      .eq('id', userId)
      .single();

    const profileData = (userRow?.profile_data && typeof userRow.profile_data === 'object')
      ? userRow.profile_data
      : {};
    // users.verification_status is the admin override — if admin explicitly downgraded,
    // that wins regardless of what the ngo_verifications table says.
    const adminStatus = String(userRow?.verification_status || '').trim().toLowerCase();
    const effectiveStatus = (adminStatus === 'unverified' || adminStatus === 'suspended' || adminStatus === 'pending')
      ? adminStatus
      : adminStatus === 'verified'
        ? 'verified'
        : (verification.verification_status || 'unverified');

    return NextResponse.json({
      verified: effectiveStatus === 'verified',
      gstVerified: verification.gst_verified || false,
      panVerified: verification.pan_verified || false,
      organizationName: verification.ngo_name,
      registrationNumber: verification.registration_number,
      registrationType: verification.registration_type,
      status: effectiveStatus,
      verification_status: effectiveStatus,
      reverification_pending: Boolean(profileData.reverification_pending),
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