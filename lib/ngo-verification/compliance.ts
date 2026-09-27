import { NextResponse } from 'next/server';
import {
  getComplianceDocumentUrl,
  mergeNgoComplianceNumbers,
  parseSubmittedComplianceNumbers,
  type NgoComplianceNumbers,
} from '@/lib/auth';
import { parseJsonObject } from '@/lib/utils';
import type { Json } from '@/lib/database.types';

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

export function validateOptionalNgoCertificates(options: {
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
  const existingDocs = parseJsonObject(options.existingProfileData.compliance_documents);
  const existingVerification = parseJsonObject(
    parseJsonObject(parseJsonObject(options.existingProfileData.verification_documents).ngo).documents
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

export function resolveComplianceNumbersForSubmission(
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

export function mergeSubmittedComplianceDocuments(
  existingComplianceDocuments: Record<string, Json | undefined>,
  complianceDocuments?: Record<string, string>,
  verificationDocuments?: Record<string, string>
): Record<string, Json | undefined> {
  const next = { ...existingComplianceDocuments };

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
