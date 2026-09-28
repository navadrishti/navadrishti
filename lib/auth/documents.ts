import { NextResponse } from 'next/server';
import { parseJsonObject } from '@/lib/utils';

export type ComplianceDocumentKey = 'twelve_a' | 'eighty_g' | 'csr1';

export const COMPLIANCE_DOCUMENT_LABELS: Record<ComplianceDocumentKey, string> = {
  twelve_a: '12A certificate',
  eighty_g: '80G certificate',
  csr1: 'CSR-1 certificate',
};

export type ComplianceDocuments = Partial<Record<ComplianceDocumentKey, string>>;

export function getCoverImageUrl(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim()
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    if (typeof record.cover_image === 'string') return record.cover_image.trim()
    if (typeof record.cover_photo === 'string') return record.cover_photo.trim()
  }

  return ''
}

export function getComplianceDocumentUrl(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (value && typeof value === 'object' && 'url' in value) {
    return String((value as { url?: unknown }).url || '').trim();
  }

  return '';
}

export function getNgoFcraDocumentUrl(profileData: unknown): string {
  const data = parseJsonObject(profileData);
  const complianceDocs = parseJsonObject(data.compliance_documents);
  const pendingCompliance = parseJsonObject(complianceDocs.pending_reverification);
  const ngoBlock = parseJsonObject(parseJsonObject(data.verification_documents).ngo);
  const verificationDocs = parseJsonObject(ngoBlock.documents);
  const pendingVerification = parseJsonObject(ngoBlock.reverification_documents);

  return (
    getComplianceDocumentUrl(complianceDocs.fcra) ||
    getComplianceDocumentUrl(verificationDocs.ngoFcraPhoto) ||
    getComplianceDocumentUrl(pendingVerification.ngoFcraPhoto) ||
    getComplianceDocumentUrl(pendingCompliance.fcra)
  );
}

export function requireBankStatementDocument(documents: unknown): NextResponse | null {
  const record = documents && typeof documents === 'object' && !Array.isArray(documents)
    ? (documents as Record<string, unknown>)
    : {};

  if (getComplianceDocumentUrl(record.bankStatement)) {
    return null;
  }

  return NextResponse.json(
    { error: 'Bank statement for the last 6 months is required.' },
    { status: 400 }
  );
}
