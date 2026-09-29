import 'server-only';

import { supabase } from '@/lib/db';
import {
  allotCaComplianceTags,
  backfillNgoComplianceProfileData,
  dropExpiredCaComplianceTags,
  mergeNgoComplianceNumbers,
  buildNgoDocumentExpiries,
} from '@/lib/auth';
import { applyCaBadgeToProfile } from '@/lib/platform-ca-auth';
import { parseJsonObject } from '@/lib/utils';
import type { Json } from '@/lib/database.types';

type UserType = 'individual' | 'ngo' | 'company';

export class ReverificationConflictError extends Error {
  constructor() {
    super('This reverification was already decided by another reviewer');
    this.name = 'ReverificationConflictError';
  }
}

const verificationDocKeyByUserType: Record<UserType, string> = {
  individual: 'individual',
  ngo: 'ngo',
  company: 'company',
};

export const reverificationDocumentLabels: Record<string, string> = {
  individualAadhaar: 'Aadhaar Card',
  individualPanCard: 'PAN Card',
  bankStatement: 'Bank Statement (Last 6 months)',
  ngoRegistrationCertificate: 'Registration Certificate',
  ngoPanCard: 'PAN Card of NGO',
  ngoAddressProof: 'Address Proof',
  ngoTrustOrMoaAoa: 'Trust Deed / MOA / AOA',
  ngoFcraPhoto: 'FCRA Registration Document',
  ngoTwelveACertificate: '12A Certificate',
  ngoEightyGCertificate: '80G Certificate',
  ngoCsr1Certificate: 'CSR-1 Certificate',
  companyIncorporationCertificate: 'Certificate of Incorporation',
  companyPanCard: 'PAN Card of Company',
  companyGstCertificate: 'GST Certificate',
  companyAddressProof: 'Company Address Proof',
  twelve_a: '12A Certificate',
  eighty_g: '80G Certificate',
  csr1: 'CSR-1 Certificate',
};

function getVerificationTypeKey(userType: string): string | null {
  if (userType === 'individual' || userType === 'ngo' || userType === 'company') {
    return verificationDocKeyByUserType[userType];
  }
  return null;
}

export function extractReverificationSummary(user: {
  id: number;
  name?: string | null;
  email?: string | null;
  user_type?: string | null;
  verification_status?: string | null;
  profile_data?: unknown;
}) {
  const profileData = parseJsonObject(user.profile_data);
  if (!profileData.reverification_pending) {
    return null;
  }

  const typeKey = getVerificationTypeKey(String(user.user_type || ''));
  if (!typeKey) {
    return null;
  }

  const verificationDocuments = parseJsonObject(profileData.verification_documents);
  const typeBlock = parseJsonObject(verificationDocuments[typeKey]);
  const currentDocuments = parseJsonObject(typeBlock.documents);
  const pendingDocuments = parseJsonObject(typeBlock.reverification_documents);
  const complianceDocuments = parseJsonObject(profileData.compliance_documents);
  const pendingComplianceDocuments = parseJsonObject(complianceDocuments.pending_reverification);

  return {
    user_id: user.id,
    name: user.name || '',
    email: user.email || '',
    user_type: user.user_type || '',
    verification_status: user.verification_status || 'verified',
    submitted_at: typeBlock.reverification_submitted_at || null,
    reverification_status: typeBlock.reverification_status || 'pending',
    current_documents: currentDocuments,
    pending_documents: pendingDocuments,
    pending_compliance_documents: pendingComplianceDocuments,
  };
}

export async function listPendingReverifications(limit = 100) {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, user_type, verification_status, profile_data, updated_at')
    .eq('verification_status', 'verified')
    .order('updated_at', { ascending: false })
    .limit(Math.min(limit, 500));

  if (error) {
    throw error;
  }

  return (data || [])
    .map((user) => extractReverificationSummary(user))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

async function loadReverificationUser(userId: number) {
  const { data: user, error } = await supabase
    .from('users')
    .select('id, name, email, user_type, verification_status, profile_data')
    .eq('id', userId)
    .single();

  if (error || !user) {
    throw new Error('User not found');
  }

  const summary = extractReverificationSummary(user);
  if (!summary) {
    throw new Error('No pending reverification for this user');
  }

  return { user, summary };
}

function buildClearedTypeBlock(
  typeBlock: Record<string, Json | undefined>,
  updates: Record<string, Json | undefined>
) {
  const nextBlock = { ...typeBlock, ...updates };
  delete nextBlock.reverification_documents;
  delete nextBlock.reverification_compliance_numbers;
  delete nextBlock.reverification_entered_fields;
  delete nextBlock.reverification_details;
  return nextBlock;
}

function nonEmptyStrings(value: unknown, allowedKeys?: readonly string[]) {
  return Object.fromEntries(
    Object.entries(parseJsonObject(value)).filter(
      ([key, entry]) =>
        (!allowedKeys || allowedKeys.includes(key)) && typeof entry === 'string' && entry.trim().length > 0
    )
  ) as Record<string, string>;
}

const NGO_DETAIL_KEYS = ['ngo_name', 'registration_number', 'registration_type', 'fcra_number'] as const;
const COMPANY_DETAIL_KEYS = ['company_name', 'gst_number', 'registration_number'] as const;

async function applyStagedVerificationDetails(userId: number, userType: string, stagedDetails: unknown) {
  const keys = userType === 'ngo' ? NGO_DETAIL_KEYS : userType === 'company' ? COMPANY_DETAIL_KEYS : null;
  const details = keys ? nonEmptyStrings(stagedDetails, keys) : {};
  if (Object.keys(details).length === 0) return;

  const update = { ...details, updated_at: new Date().toISOString() };
  const { error } =
    userType === 'ngo'
      ? await supabase.from('ngo_verifications').update(update).eq('user_id', userId)
      : await supabase.from('company_verifications').update(update).eq('user_id', userId);
  if (error) {
    console.error('Failed to apply approved reverification details:', error);
  }
}

export async function approveReverification(
  userId: number,
  reviewedBy = 'admin',
  complianceTags?: unknown
) {
  const { user, summary } = await loadReverificationUser(userId);
  const profileData = parseJsonObject(user.profile_data);
  const typeKey = getVerificationTypeKey(String(user.user_type || ''));
  if (!typeKey) {
    throw new Error('Unsupported user type for reverification');
  }

  const verificationDocuments = parseJsonObject(profileData.verification_documents);
  const typeBlock = parseJsonObject(verificationDocuments[typeKey]);
  const pendingDocuments = parseJsonObject(typeBlock.reverification_documents);

  if (Object.keys(pendingDocuments).length === 0 && Object.keys(summary.pending_compliance_documents).length === 0) {
    throw new Error('No reverification documents found');
  }

  let complianceDocuments = parseJsonObject(profileData.compliance_documents);
  if (user.user_type === 'ngo') {
    const pendingCompliance = parseJsonObject(complianceDocuments.pending_reverification);
    if (Object.keys(pendingCompliance).length > 0) {
      complianceDocuments = {
        ...complianceDocuments,
        twelve_a: pendingCompliance.twelve_a || complianceDocuments.twelve_a,
        eighty_g: pendingCompliance.eighty_g || complianceDocuments.eighty_g,
        csr1: pendingCompliance.csr1 || complianceDocuments.csr1,
      };
    }
    delete complianceDocuments.pending_reverification;
  }

  const pendingNumbers = parseJsonObject(typeBlock.reverification_compliance_numbers);
  const stagedDetails = typeBlock.reverification_details;
  let nextProfileData: Record<string, unknown> = {
    ...profileData,
    reverification_pending: false,
    compliance_documents: complianceDocuments,
    verification_documents: {
      ...verificationDocuments,
      [typeKey]: buildClearedTypeBlock(typeBlock, {
        documents: {
          ...parseJsonObject(typeBlock.documents),
          ...pendingDocuments,
        },
        entered_fields: {
          ...parseJsonObject(typeBlock.entered_fields),
          ...nonEmptyStrings(typeBlock.reverification_entered_fields),
        },
        status: 'verified',
        reverification_status: 'approved',
        reverification_reviewed_at: new Date().toISOString(),
        reverification_reviewed_by: reviewedBy,
      }),
    },
  };

    if (user.user_type === 'ngo') {
    const mergedNumbers = mergeNgoComplianceNumbers(nextProfileData, pendingNumbers);
    nextProfileData = {
      ...nextProfileData,
      twelve_a_number: mergedNumbers.twelve_a_number,
      eighty_g_number: mergedNumbers.eighty_g_number,
      csr1_registration_number: mergedNumbers.csr1_registration_number,
    };
    nextProfileData = backfillNgoComplianceProfileData(nextProfileData).profileData;
    const typeBlockAfter = parseJsonObject(parseJsonObject(nextProfileData.verification_documents).ngo);
    const ocrExpiries = parseJsonObject(typeBlockAfter.ocr_expiries);
    const entered = {
      ...parseJsonObject(typeBlockAfter.entered_fields),
      ...(ocrExpiries.twelve_a ? { twelve_a_expiry: ocrExpiries.twelve_a } : {}),
      ...(ocrExpiries.eighty_g ? { eighty_g_expiry: ocrExpiries.eighty_g } : {}),
      ...(ocrExpiries.csr1 ? { csr1_expiry: ocrExpiries.csr1 } : {}),
      ...(ocrExpiries.fcra ? { fcra_expiry: ocrExpiries.fcra } : {}),
    };
    const mergedDocs = parseJsonObject(typeBlockAfter.documents);
    nextProfileData = {
      ...nextProfileData,
      fcra_expiry_date: entered.fcra_expiry || nextProfileData.fcra_expiry_date || null,
      document_expiries: buildNgoDocumentExpiries({
        profileData: nextProfileData,
        enteredFields: entered,
        documents: mergedDocs,
        submittedAt:
          typeBlockAfter.reverification_submitted_at ||
          typeBlockAfter.submitted_at ||
          new Date().toISOString(),
      }),
      document_expiry_unverified_at: null,
      document_expiry_unverified_docs: null,
      verification_documents: {
        ...parseJsonObject(nextProfileData.verification_documents),
        ngo: {
          ...typeBlockAfter,
          entered_fields: entered,
        },
      },
    };
    nextProfileData = dropExpiredCaComplianceTags(nextProfileData).profileData;
    nextProfileData = allotCaComplianceTags(nextProfileData, complianceTags).profileData;
  }

  const attached = applyCaBadgeToProfile(nextProfileData, userId, {
    verifiedAt: new Date().toISOString(),
    verifiedBy: reviewedBy,
  });
  nextProfileData = attached.profileData;

  const saved = await saveReverificationDecision(userId, nextProfileData as Json);
  await applyStagedVerificationDetails(userId, String(user.user_type || ''), stagedDetails);
  return saved;
}

async function saveReverificationDecision(userId: number, profileData: Json) {
  const { data, error } = await supabase
    .from('users')
    .update({
      profile_data: profileData,
      verification_status: 'verified',
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .eq('verification_status', 'verified')
    .contains('profile_data', { reverification_pending: true })
    .select('id, name, email, user_type, verification_status, profile_data, updated_at')
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!data) {
    throw new ReverificationConflictError();
  }

  return data;
}

export async function rejectReverification(userId: number, reason = '', reviewedBy = 'admin') {
  const { user } = await loadReverificationUser(userId);
  const profileData = parseJsonObject(user.profile_data);
  const typeKey = getVerificationTypeKey(String(user.user_type || ''));
  if (!typeKey) {
    throw new Error('Unsupported user type for reverification');
  }

  const verificationDocuments = parseJsonObject(profileData.verification_documents);
  const typeBlock = parseJsonObject(verificationDocuments[typeKey]);

  const complianceDocuments = parseJsonObject(profileData.compliance_documents);
  if (user.user_type === 'ngo') {
    delete complianceDocuments.pending_reverification;
  }

  const nextProfileData = {
    ...profileData,
    reverification_pending: false,
    compliance_documents: complianceDocuments,
    verification_documents: {
      ...verificationDocuments,
      [typeKey]: buildClearedTypeBlock(typeBlock, {
        reverification_status: 'rejected',
        reverification_rejection_reason: reason.trim(),
        reverification_reviewed_at: new Date().toISOString(),
        reverification_reviewed_by: reviewedBy,
      }),
    },
  };

  return saveReverificationDecision(userId, nextProfileData);
}
