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

type UserType = 'individual' | 'ngo' | 'company';

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

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

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
  const profileData = asRecord(user.profile_data);
  if (!profileData.reverification_pending) {
    return null;
  }

  const typeKey = getVerificationTypeKey(String(user.user_type || ''));
  if (!typeKey) {
    return null;
  }

  const verificationDocuments = asRecord(profileData.verification_documents);
  const typeBlock = asRecord(verificationDocuments[typeKey]);
  const currentDocuments = asRecord(typeBlock.documents);
  const pendingDocuments = asRecord(typeBlock.reverification_documents);
  const complianceDocuments = asRecord(profileData.compliance_documents);
  const pendingComplianceDocuments = asRecord(complianceDocuments.pending_reverification);

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

function buildClearedTypeBlock(typeBlock: Record<string, any>, updates: Record<string, any>) {
  const nextBlock = { ...typeBlock, ...updates };
  delete nextBlock.reverification_documents;
  delete nextBlock.reverification_compliance_numbers;
  return nextBlock;
}

export async function approveReverification(
  userId: number,
  reviewedBy = 'admin',
  complianceTags?: unknown
) {
  const { user, summary } = await loadReverificationUser(userId);
  const profileData = asRecord(user.profile_data);
  const typeKey = getVerificationTypeKey(String(user.user_type || ''));
  if (!typeKey) {
    throw new Error('Unsupported user type for reverification');
  }

  const verificationDocuments = asRecord(profileData.verification_documents);
  const typeBlock = asRecord(verificationDocuments[typeKey]);
  const pendingDocuments = asRecord(typeBlock.reverification_documents);

  if (Object.keys(pendingDocuments).length === 0 && Object.keys(summary.pending_compliance_documents).length === 0) {
    throw new Error('No reverification documents found');
  }

  let complianceDocuments = asRecord(profileData.compliance_documents);
  if (user.user_type === 'ngo') {
    const pendingCompliance = asRecord(complianceDocuments.pending_reverification);
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

  const pendingNumbers = asRecord(typeBlock.reverification_compliance_numbers);
  let nextProfileData: Record<string, any> = {
    ...profileData,
    reverification_pending: false,
    compliance_documents: complianceDocuments,
    verification_documents: {
      ...verificationDocuments,
      [typeKey]: buildClearedTypeBlock(typeBlock, {
        documents: {
          ...asRecord(typeBlock.documents),
          ...pendingDocuments,
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
    const typeBlockAfter = asRecord(asRecord(nextProfileData.verification_documents).ngo);
    const ocrExpiries = asRecord(typeBlockAfter.ocr_expiries);
    const entered = {
      ...asRecord(typeBlockAfter.entered_fields),
      ...(ocrExpiries.twelve_a ? { twelve_a_expiry: ocrExpiries.twelve_a } : {}),
      ...(ocrExpiries.eighty_g ? { eighty_g_expiry: ocrExpiries.eighty_g } : {}),
      ...(ocrExpiries.csr1 ? { csr1_expiry: ocrExpiries.csr1 } : {}),
      ...(ocrExpiries.fcra ? { fcra_expiry: ocrExpiries.fcra } : {}),
    };
    const mergedDocs = asRecord(typeBlockAfter.documents);
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
        ...asRecord(nextProfileData.verification_documents),
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

  const { data, error } = await supabase
    .from('users')
    .update({
      profile_data: nextProfileData,
      verification_status: 'verified',
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select('id, name, email, user_type, verification_status, profile_data, updated_at')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function rejectReverification(userId: number, reason = '', reviewedBy = 'admin') {
  const { user } = await loadReverificationUser(userId);
  const profileData = asRecord(user.profile_data);
  const typeKey = getVerificationTypeKey(String(user.user_type || ''));
  if (!typeKey) {
    throw new Error('Unsupported user type for reverification');
  }

  const verificationDocuments = asRecord(profileData.verification_documents);
  const typeBlock = asRecord(verificationDocuments[typeKey]);

  let complianceDocuments = asRecord(profileData.compliance_documents);
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

  const { data, error } = await supabase
    .from('users')
    .update({
      profile_data: nextProfileData,
      verification_status: 'verified',
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select('id, name, email, user_type, verification_status, profile_data, updated_at')
    .single();

  if (error) {
    throw error;
  }

  return data;
}
