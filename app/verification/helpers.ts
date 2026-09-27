import type { User } from '@/lib/auth-context';
import { PHONE_VERIFICATION_ENABLED } from '@/lib/auth';
import { parseJsonObject } from '@/lib/utils';
import type { DocumentKey, VerificationCategory, VerificationFormData } from './types';

export const documentLabels: Record<DocumentKey, string> = {
  individualAadhaar: 'Aadhaar Card',
  individualPanCard: 'PAN Card',
  bankStatement: 'Bank Statement (Last 6 months)',
  ngoRegistrationCertificate: 'Registration Certificate (Trust / Society / Section 8)',
  ngoPanCard: 'PAN Card of NGO',
  ngoAddressProof: 'Address Proof (utility bill / rent agreement / bank letter)',
  ngoTrustOrMoaAoa: 'Trust Deed / MOA / AOA',
  ngoFcraPhoto: 'FCRA Registration Document Photo',
  ngoTwelveACertificate: '12A Certificate',
  ngoEightyGCertificate: '80G Certificate',
  ngoCsr1Certificate: 'CSR-1 Certificate',
  companyIncorporationCertificate: 'Certificate of Incorporation',
  companyPanCard: 'PAN Card of Company',
  companyGstCertificate: 'GST Certificate (if applicable)',
  companyAddressProof: 'Company Address Proof'
};

const allDocumentKeys = Object.keys(documentLabels) as DocumentKey[];

export const initialFormData: VerificationFormData = {
  entityName: '',
  contactNumber: '',
  email: '',
  category: 'individual',
  panNumber: '',
  aadhaarNumber: '',
  registrationNumber: '',
  ngoRegistrationType: 'Trust',
  ngoFcraRegistrationNumber: '',
  ngoFcraExpiryDate: '',
  ngoAssociationNumber: '',
  ngoTwelveANumber: '',
  ngoTwelveAExpiryDate: '',
  ngoEightyGNumber: '',
  ngoEightyGExpiryDate: '',
  ngoCsr1RegistrationNumber: '',
  ngoCsr1ExpiryDate: '',
  companyCinNumber: '',
  companyGstNumber: '',
  companyGstApplicable: false
};

export function createDocumentMap<T>(value: T): Record<DocumentKey, T> {
  return allDocumentKeys.reduce((acc, key) => {
    acc[key] = value;
    return acc;
  }, {} as Record<DocumentKey, T>);
}

export function resolveCategory(userType?: string): VerificationCategory {
  if (userType === 'ngo') return 'ngo';
  if (userType === 'company') return 'company';
  return 'individual';
}

export function dashboardPathFor(userType?: string): string | null {
  if (userType === 'individual') return '/individuals/dashboard#top';
  if (userType === 'ngo') return '/ngos/dashboard#top';
  if (userType === 'company') return '/companies/dashboard#top';
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export function getUserFormDefaults(user: User): Partial<VerificationFormData> {
  const profileData: Record<string, unknown> = parseJsonObject(user.profile_data);
  const documentExpiries = asRecord(profileData.document_expiries) as Record<
    string,
    { valid_until?: string; number?: string } | undefined
  >;
  const entered = asRecord(asRecord(asRecord(profileData.verification_documents).ngo).entered_fields);

  return {
    entityName: user.name || '',
    contactNumber: user.phone || '',
    email: user.email || '',
    category: resolveCategory(user.user_type),
    ngoTwelveANumber: String(profileData.twelve_a_number || entered.twelve_a || ''),
    ngoEightyGNumber: String(profileData.eighty_g_number || entered.eighty_g || ''),
    ngoCsr1RegistrationNumber: String(profileData.csr1_registration_number || entered.csr1 || ''),
    ngoFcraRegistrationNumber: String(entered.fcra_number || documentExpiries.fcra?.number || ''),
    ngoFcraExpiryDate: String(
      entered.fcra_expiry || profileData.fcra_expiry_date || documentExpiries.fcra?.valid_until || ''
    ),
    ngoTwelveAExpiryDate: String(entered.twelve_a_expiry || documentExpiries.twelve_a?.valid_until || ''),
    ngoEightyGExpiryDate: String(entered.eighty_g_expiry || documentExpiries.eighty_g?.valid_until || ''),
    ngoCsr1ExpiryDate: String(entered.csr1_expiry || documentExpiries.csr1?.valid_until || ''),
  };
}

export function getRequiredDocs(formData: VerificationFormData): DocumentKey[] {
  if (formData.category === 'individual') {
    return ['individualAadhaar', 'individualPanCard', 'bankStatement'];
  }

  if (formData.category === 'ngo') {
    const docs: DocumentKey[] = [
      'ngoRegistrationCertificate',
      'ngoPanCard',
      'ngoAddressProof',
      'ngoTrustOrMoaAoa',
      'bankStatement',
    ];
    if (formData.ngoFcraRegistrationNumber.trim()) docs.push('ngoFcraPhoto');
    if (formData.ngoTwelveANumber.trim()) docs.push('ngoTwelveACertificate');
    if (formData.ngoEightyGNumber.trim()) docs.push('ngoEightyGCertificate');
    if (formData.ngoCsr1RegistrationNumber.trim()) docs.push('ngoCsr1Certificate');
    return docs;
  }

  return [
    'companyIncorporationCertificate',
    'companyPanCard',
    'companyAddressProof',
    'bankStatement',
    ...(formData.companyGstApplicable ? (['companyGstCertificate'] as DocumentKey[]) : [])
  ];
}

export function getDetailsError(formData: VerificationFormData, isEmailVerified: boolean): string | null {
  if (!formData.entityName || !formData.email) {
    return 'Please fill name and email.';
  }

  if (PHONE_VERIFICATION_ENABLED && !formData.contactNumber) {
    return 'Please fill name, contact number, and email.';
  }

  if (!isEmailVerified) {
    return 'Email verification is mandatory for all verification types. Please verify your email first.';
  }

  if (formData.category === 'individual') {
    if (!/^\d{12}$/.test(formData.aadhaarNumber.replace(/\s/g, '')) || !formData.panNumber) {
      return 'Please enter a 12-digit Aadhaar number and PAN number.';
    }
    return null;
  }

  if (formData.category === 'ngo') {
    if (!formData.panNumber || !formData.registrationNumber || !formData.ngoAssociationNumber) {
      return 'Please fill registration number, PAN number, and association number.';
    }

    if (formData.ngoFcraRegistrationNumber.trim() && !formData.ngoFcraExpiryDate.trim()) {
      return 'FCRA expiry date is required when the FCRA registration number is provided.';
    }
    if (formData.ngoTwelveANumber.trim() && !formData.ngoTwelveAExpiryDate.trim()) {
      return '12A expiry date is required when the 12A number is provided.';
    }
    if (formData.ngoEightyGNumber.trim() && !formData.ngoEightyGExpiryDate.trim()) {
      return '80G expiry date is required when the 80G number is provided.';
    }
    if (formData.ngoCsr1RegistrationNumber.trim() && !formData.ngoCsr1ExpiryDate.trim()) {
      return 'CSR-1 expiry date is required when the CSR-1 number is provided.';
    }
    return null;
  }

  if (!formData.panNumber || !formData.registrationNumber || !formData.companyCinNumber) {
    return 'Please fill company registration number, PAN number, and CIN number.';
  }

  if (formData.companyGstApplicable && !formData.companyGstNumber.trim()) {
    return 'Please enter the GST number, or uncheck GST applicable.';
  }

  return null;
}

export async function uploadVerificationDocument(
  file: File,
  key: DocumentKey,
  category: VerificationCategory
): Promise<string> {
  const token = localStorage.getItem('token');
  if (!token) {
    throw new Error('Authentication required. Please log in again.');
  }

  const body = new FormData();
  body.append('file', file);
  body.append('documentKey', key);
  body.append('category', category);

  const response = await fetch('/api/verification/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.details || result.error || 'Failed to upload one or more documents');
  }

  return result.data?.url as string;
}

export function buildInitiatePayload(
  userType: User['user_type'],
  formData: VerificationFormData,
  uploaded: Record<DocumentKey, string>,
  documents: Record<string, string>,
  reverify: boolean
): Record<string, unknown> {
  const base = {
    action: reverify ? 'reverify' : 'initiate',
    documents,
  };

  if (userType === 'ngo') {
    return {
      ...base,
      organizationName: formData.entityName,
      registrationNumber: formData.registrationNumber,
      registrationType: formData.ngoRegistrationType,
      panNumber: formData.panNumber,
      fcraNumber: formData.ngoFcraRegistrationNumber,
      fcraExpiryDate: formData.ngoFcraExpiryDate,
      twelveAExpiryDate: formData.ngoTwelveAExpiryDate || undefined,
      eightyGExpiryDate: formData.ngoEightyGExpiryDate || undefined,
      csr1ExpiryDate: formData.ngoCsr1ExpiryDate || undefined,
      complianceDocuments: {
        twelve_a: uploaded.ngoTwelveACertificate,
        eighty_g: uploaded.ngoEightyGCertificate,
        csr1: uploaded.ngoCsr1Certificate,
      },
      complianceNumbers: {
        twelve_a_number: formData.ngoTwelveANumber.trim(),
        eighty_g_number: formData.ngoEightyGNumber.trim(),
        csr1_registration_number: formData.ngoCsr1RegistrationNumber.trim(),
      },
    };
  }

  if (userType === 'company') {
    return {
      ...base,
      companyName: formData.entityName,
      cinNumber: formData.companyCinNumber || formData.registrationNumber,
      registrationNumber: formData.registrationNumber,
      panNumber: formData.panNumber,
      gstNumber: formData.companyGstApplicable ? formData.companyGstNumber.trim().toUpperCase() : '',
      companyType: 'Registered Company',
    };
  }

  return {
    ...base,
    documentType: 'aadhaar',
    aadhaarNumber: formData.aadhaarNumber.replace(/\s/g, ''),
    panNumber: formData.panNumber.trim().toUpperCase(),
  };
}
