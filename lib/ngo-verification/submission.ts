import { NextResponse } from 'next/server';
import { db, supabase } from '@/lib/db';
import { buildNgoDocumentExpiries, normalizeExpiryDate } from '@/lib/auth';
import { parseJsonObject, getErrorMessage } from '@/lib/utils';
import type { TablesUpdate } from '@/lib/database.types';
import {
  mergeSubmittedComplianceDocuments,
  resolveComplianceNumbersForSubmission,
  validateOptionalNgoCertificates,
} from './compliance';

export type NgoVerificationSubmission = {
  organizationName: string;
  registrationNumber: string;
  registrationType: string;
  documents?: Record<string, string>;
  complianceDocuments?: Record<string, string>;
  complianceNumbers?: unknown;
  panNumber?: string;
  fcraNumber?: string;
  fcraExpiryDate?: string;
  twelveAExpiryDate?: string;
  eightyGExpiryDate?: string;
  csr1ExpiryDate?: string;
};

function prepareSubmission(existingProfileData: Record<string, unknown>, input: NgoVerificationSubmission) {
  const { merged, submitted } = resolveComplianceNumbersForSubmission(
    existingProfileData,
    input.complianceNumbers
  );

  const fcraNumber = typeof input.fcraNumber === 'string' ? input.fcraNumber.trim() : '';
  const fcraExpiry = normalizeExpiryDate(input.fcraExpiryDate) || '';
  const twelveAExpiry = normalizeExpiryDate(input.twelveAExpiryDate) || '';
  const eightyGExpiry = normalizeExpiryDate(input.eightyGExpiryDate) || '';
  const csr1Expiry = normalizeExpiryDate(input.csr1ExpiryDate) || '';

  const error = validateOptionalNgoCertificates({
    existingProfileData,
    documents: input.documents,
    complianceDocuments: input.complianceDocuments,
    numbers: merged,
    fcraNumber,
    fcraExpiry,
    twelveAExpiry,
    eightyGExpiry,
    csr1Expiry,
  });
  if (error) return { error };

  const submittedAt = new Date().toISOString();
  const entered = {
    pan: typeof input.panNumber === 'string' ? input.panNumber.trim().toUpperCase() : '',
    fcra_number: fcraNumber,
    fcra_expiry: fcraExpiry,
    registration_number: input.registrationNumber,
    twelve_a: merged.twelve_a_number,
    eighty_g: merged.eighty_g_number,
    csr1: merged.csr1_registration_number,
    twelve_a_expiry: twelveAExpiry,
    eighty_g_expiry: eightyGExpiry,
    csr1_expiry: csr1Expiry,
  };

  const documentExpiries = buildNgoDocumentExpiries({
    profileData: existingProfileData,
    enteredFields: entered,
    documents: {
      ...(input.documents || {}),
      bankStatement: input.documents?.bankStatement,
    },
    submittedAt,
  });

  return { error: null, merged, submitted, entered, submittedAt, documentExpiries };
}

export async function initiateNgoVerification(userId: number, input: NgoVerificationSubmission) {
  try {
    const { data: userRow } = await supabase
      .from('users')
      .select('profile_data')
      .eq('id', userId)
      .single();

    const existingProfileData = parseJsonObject(userRow?.profile_data);

    const prepared = prepareSubmission(existingProfileData, input);
    if (prepared.error) return prepared.error;
    const { merged, submitted, entered, submittedAt, documentExpiries } = prepared;
    const { documents, complianceDocuments } = input;

    const ngoPayload: TablesUpdate<'ngo_verifications'> = {
      ngo_name: input.organizationName,
      registration_number: input.registrationNumber,
      registration_type: input.registrationType,
      verification_status: 'pending',
    };
    if (entered.fcra_number) ngoPayload.fcra_number = entered.fcra_number;

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
        })
        .throwOnError();
    } else {
      await supabase
        .from('ngo_verifications')
        .update(ngoPayload)
        .eq('user_id', userId)
        .throwOnError();
    }

    const existingVerificationDocs = parseJsonObject(existingProfileData.verification_documents);
    const existingComplianceDocuments =
      parseJsonObject(existingProfileData.compliance_documents);
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
          twelve_a_number: merged.twelve_a_number,
          eighty_g_number: merged.eighty_g_number,
          csr1_registration_number: merged.csr1_registration_number,
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
              compliance_numbers: submitted,
              submitted_at: submittedAt,
              status: 'pending'
            }
          }
        },
        verification_status: 'pending'
      })
      .eq('id', userId)
      .throwOnError();

    await db.verificationDocuments.syncActorDocuments({
      userId,
      actorType: 'ngo',
      documents: documents || {},
      numbers: {
        twelve_a: merged.twelve_a_number,
        eighty_g: merged.eighty_g_number,
        csr1: merged.csr1_registration_number,
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
      message: 'Verification initiated in manual mode. Your uploaded documents will be reviewed by a CA.'
    });
  } catch (error) {
    console.error('NGO verification initiation error:', error);
    return NextResponse.json({
      error: getErrorMessage(error) || 'Failed to initiate verification',
      code: 'INITIATION_FAILED'
    }, { status: 500 });
  }
}

export async function reverifyNgoVerification(userId: number, input: NgoVerificationSubmission) {
  try {
    const { data: userRow, error: userError } = await supabase
      .from('users')
      .select('verification_status, profile_data')
      .eq('id', userId)
      .single();

    if (userError || !userRow || userRow.verification_status !== 'verified') {
      return NextResponse.json({ error: 'Only verified users can request reverification' }, { status: 400 });
    }

    const existingProfileData = parseJsonObject(userRow.profile_data);

    const prepared = prepareSubmission(existingProfileData, input);
    if (prepared.error) return prepared.error;
    const { merged, submitted, entered, submittedAt, documentExpiries } = prepared;
    const { documents, complianceDocuments } = input;

    const { data: existingVerification } = await supabase
      .from('ngo_verifications')
      .select('verification_status')
      .eq('user_id', userId)
      .single();

    if (!existingVerification || existingVerification.verification_status !== 'verified') {
      return NextResponse.json({ error: 'Only verified users can request reverification' }, { status: 400 });
    }

    const existingVerificationDocs = parseJsonObject(existingProfileData.verification_documents);
    const existingComplianceDocuments =
      parseJsonObject(existingProfileData.compliance_documents);
    const pendingComplianceDocuments =
      complianceDocuments && typeof complianceDocuments === 'object'
        ? Object.fromEntries(
            Object.entries(complianceDocuments).filter(([, value]) => typeof value === 'string' && value.trim())
          )
        : {};

    await supabase
      .from('ngo_verifications')
      .update({
        ngo_name: input.organizationName,
        registration_number: input.registrationNumber,
        registration_type: input.registrationType,
        ...(entered.fcra_number ? { fcra_number: entered.fcra_number } : {}),
      })
      .eq('user_id', userId)
      .throwOnError();

    await supabase
      .from('users')
      .update({
        profile_data: {
          ...existingProfileData,
          twelve_a_number: merged.twelve_a_number,
          eighty_g_number: merged.eighty_g_number,
          csr1_registration_number: merged.csr1_registration_number,
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
              reverification_compliance_numbers: submitted,
              reverification_submitted_at: submittedAt,
              entered_fields: entered,
            },
          },
        },
      })
      .eq('id', userId)
      .throwOnError();

    return NextResponse.json({
      success: true,
      mode: 'reverification',
      message: 'Reverification submitted. You remain verified while your updated documents are reviewed.',
    });
  } catch (error) {
    console.error('NGO reverification error:', error);
    return NextResponse.json({
      error: getErrorMessage(error) || 'Failed to submit reverification',
      code: 'REVERIFICATION_FAILED',
    }, { status: 500 });
  }
}
