import { parseJsonObject } from '@/lib/utils';
import { getComplianceDocumentUrl, type ComplianceDocumentKey, type ComplianceDocuments } from './documents';
import { readNgoTextField } from './normalize';

export type NgoComplianceNumbers = {
  twelve_a_number: string;
  eighty_g_number: string;
  csr1_registration_number: string;
};

const COMPLIANCE_NUMBER_FIELDS = [
  'twelve_a_number',
  'eighty_g_number',
  'csr1_registration_number',
] as const satisfies ReadonlyArray<keyof NgoComplianceNumbers>;

const VERIFICATION_TO_COMPLIANCE_DOC_MAP: Record<string, ComplianceDocumentKey> = {
  ngoTwelveACertificate: 'twelve_a',
  ngoEightyGCertificate: 'eighty_g',
  ngoCsr1Certificate: 'csr1',
};

export function parseSubmittedComplianceNumbers(input: unknown): Partial<NgoComplianceNumbers> | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const obj = input as Record<string, unknown>;
  const parsed: Partial<NgoComplianceNumbers> = {};

  for (const field of COMPLIANCE_NUMBER_FIELDS) {
    const value = readNgoTextField(obj[field]);
    if (value) {
      parsed[field] = value;
    }
  }

  return Object.keys(parsed).length > 0 ? parsed : null;
}

export function mergeNgoComplianceNumbers(
  existingProfileData: Record<string, unknown>,
  incoming: Partial<NgoComplianceNumbers> | null | undefined
): NgoComplianceNumbers {
  return {
    twelve_a_number:
      readNgoTextField(existingProfileData.twelve_a_number) ||
      readNgoTextField(incoming?.twelve_a_number),
    eighty_g_number:
      readNgoTextField(existingProfileData.eighty_g_number) ||
      readNgoTextField(incoming?.eighty_g_number),
    csr1_registration_number:
      readNgoTextField(existingProfileData.csr1_registration_number) ||
      readNgoTextField(incoming?.csr1_registration_number),
  };
}

export function extractNgoComplianceFromVerification(profileData: Record<string, unknown>): {
  numbers: Partial<NgoComplianceNumbers>;
  documents: ComplianceDocuments;
} {
  const verificationDocuments = parseJsonObject(profileData.verification_documents);
  const ngoBlock = parseJsonObject(verificationDocuments.ngo);
  const storedNumbers = parseJsonObject(ngoBlock.compliance_numbers);
  const pendingNumbers = parseJsonObject(ngoBlock.reverification_compliance_numbers);
  const complianceDocumentsRoot = parseJsonObject(profileData.compliance_documents);
  const pendingComplianceDocuments = parseJsonObject(complianceDocumentsRoot.pending_reverification);

  const numbers: Partial<NgoComplianceNumbers> = {};
  for (const field of COMPLIANCE_NUMBER_FIELDS) {
    const value =
      readNgoTextField(storedNumbers[field]) ||
      readNgoTextField(pendingNumbers[field]);
    if (value) {
      numbers[field] = value;
    }
  }

  const documents: ComplianceDocuments = {};
  const documentSources = [
    complianceDocumentsRoot,
    pendingComplianceDocuments,
    parseJsonObject(ngoBlock.documents),
    parseJsonObject(ngoBlock.reverification_documents),
  ];

  for (const source of documentSources) {
    for (const [verificationKey, complianceKey] of Object.entries(VERIFICATION_TO_COMPLIANCE_DOC_MAP)) {
      if (documents[complianceKey]) {
        continue;
      }

      const url =
        getComplianceDocumentUrl(source[complianceKey]) ||
        getComplianceDocumentUrl(source[verificationKey]);

      if (url) {
        documents[complianceKey] = url;
      }
    }
  }

  return { numbers, documents };
}

export function backfillNgoComplianceProfileData(profileData: Record<string, unknown>): {
  profileData: Record<string, unknown>;
  changed: boolean;
} {
  const { numbers, documents } = extractNgoComplianceFromVerification(profileData);
  const next: Record<string, unknown> = { ...profileData };
  let changed = false;

  for (const field of COMPLIANCE_NUMBER_FIELDS) {
    if (!readNgoTextField(next[field]) && numbers[field]) {
      next[field] = numbers[field];
      changed = true;
    }
  }

  const existingComplianceDocuments = parseJsonObject(next.compliance_documents);
  const nextComplianceDocuments: Record<string, unknown> = { ...existingComplianceDocuments };

  for (const key of Object.values(VERIFICATION_TO_COMPLIANCE_DOC_MAP)) {
    if (!getComplianceDocumentUrl(nextComplianceDocuments[key]) && documents[key]) {
      nextComplianceDocuments[key] = documents[key];
      changed = true;
    }
  }

  if (changed || Object.keys(existingComplianceDocuments).length > 0) {
    next.compliance_documents = nextComplianceDocuments;
  }

  return { profileData: next, changed };
}
