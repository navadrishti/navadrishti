'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useOtpSender } from '@/hooks/use-otp-sender';
import { PHONE_VERIFICATION_ENABLED, summarizeDocumentExpiries, visibleCaBadgeNumber } from '@/lib/auth';
import { formatDisplayDate } from '@/lib/format-date';
import { smoothNavigate } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { VerificationBadge } from '@/components/verification-badge';
import { ArrowLeft, AlertTriangle, CheckCircle, FileText, Shield } from 'lucide-react';

type VerificationCategory = 'individual' | 'ngo' | 'company';
type Step = 1 | 2;
type NgoRegistrationType = 'Trust' | 'Society' | 'Section 8';
type FormErrors = Record<string, string>;

type DocumentKey =
  | 'individualAadhaar'
  | 'individualPanCard'
  | 'bankStatement'
  | 'ngoRegistrationCertificate'
  | 'ngoPanCard'
  | 'ngoAddressProof'
  | 'ngoTrustOrMoaAoa'
  | 'ngoFcraPhoto'
  | 'ngoTwelveACertificate'
  | 'ngoEightyGCertificate'
  | 'ngoCsr1Certificate'
  | 'companyIncorporationCertificate'
  | 'companyPanCard'
  | 'companyGstCertificate'
  | 'companyAddressProof';

const documentLabels: Record<DocumentKey, string> = {
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

interface VerificationFormData {
  entityName: string;
  contactNumber: string;
  email: string;
  category: VerificationCategory;
  panNumber: string;
  aadhaarNumber: string;
  registrationNumber: string;
  ngoRegistrationType: NgoRegistrationType;
  ngoFcraRegistrationNumber: string;
  ngoFcraExpiryDate: string;
  ngoAssociationNumber: string;
  ngoTwelveANumber: string;
  ngoTwelveAExpiryDate: string;
  ngoEightyGNumber: string;
  ngoEightyGExpiryDate: string;
  ngoCsr1RegistrationNumber: string;
  ngoCsr1ExpiryDate: string;
  companyCinNumber: string;
  companyGstNumber: string;
  companyGstApplicable: boolean;
}

const allDocumentKeys: DocumentKey[] = [
  'individualAadhaar',
  'individualPanCard',
  'bankStatement',
  'ngoRegistrationCertificate',
  'ngoPanCard',
  'ngoAddressProof',
  'ngoTrustOrMoaAoa',
  'ngoFcraPhoto',
  'ngoTwelveACertificate',
  'ngoEightyGCertificate',
  'ngoCsr1Certificate',
  'companyIncorporationCertificate',
  'companyPanCard',
  'companyGstCertificate',
  'companyAddressProof'
];

export default function VerificationPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const resolveCategory = (userType?: string): VerificationCategory => {
    if (userType === 'ngo') return 'ngo';
    if (userType === 'company') return 'company';
    return 'individual';
  };

  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [authSnapshot, setAuthSnapshot] = useState<{
    email_verified?: boolean;
    phone_verified?: boolean;
    verification_status?: 'verified' | 'unverified' | 'pending';
    reverification_pending?: boolean;
  } | null>(null);
  const [reverifyMode, setReverifyMode] = useState(false);
  const [reverificationPending, setReverificationPending] = useState(false);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [otpInput, setOtpInput] = useState({ email: '', phone: '' });
  const progressValue = currentStep === 1 ? 50 : 100;
  const {
    otpSending,
    otpSent,
    otpCooldown,
    otpVerifying,
    otpVerified,
    handleSendEmailOtp,
    handleVerifyEmailOtp,
    handleSendPhoneOtp
  } = useOtpSender(setFormErrors);
  const baseEmailVerified = authSnapshot?.email_verified ?? user?.email_verified ?? false;
  const isEmailVerified = mounted ? Boolean(baseEmailVerified || otpVerified.email) : false;
  const isPhoneVerified = mounted ? Boolean(authSnapshot?.phone_verified ?? user?.phone_verified ?? false) : false;
  const documentVerificationStatus = authSnapshot?.verification_status ?? user?.verification_status ?? 'unverified';
  const isDocumentVerified = mounted
    ? documentVerificationStatus === 'verified' || reverificationPending
    : false;
  const isFullyVerified = mounted
    ? Boolean(
        isEmailVerified &&
        (PHONE_VERIFICATION_ENABLED ? isPhoneVerified : true) &&
        isDocumentVerified
      )
    : false;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const fetchAuthSnapshot = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;

        const response = await fetch('/api/auth/me', {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (!response.ok) return;
        const data = await response.json();
        setAuthSnapshot({
          email_verified: data?.user?.email_verified,
          phone_verified: data?.user?.phone_verified,
          verification_status: data?.user?.verification_status
        });
      } catch {
        // keep existing values from auth context on failure
      }
    };

    const fetchVerificationStatus = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token || !user?.user_type) return;

        const response = await fetch(`/api/verification/${user.user_type}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!response.ok) return;

        const data = await response.json();
        const pending = Boolean(data?.reverification_pending);
        setReverificationPending(pending);
        setAuthSnapshot((prev) => ({
          ...(prev || {}),
          verification_status: data?.verification_status || data?.status || prev?.verification_status,
          reverification_pending: pending
        }));
      } catch {
        // ignore
      }
    };

    if (mounted) {
      fetchAuthSnapshot();
      fetchVerificationStatus();
    }
  }, [mounted, otpVerified.email, user?.user_type]);

  const [formData, setFormData] = useState<VerificationFormData>({
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
  });
  const [didSyncUserDefaults, setDidSyncUserDefaults] = useState(false);

  useEffect(() => {
    if (!mounted || !user || didSyncUserDefaults) {
      return;
    }

    const profileData = (user.profile_data && typeof user.profile_data === 'object')
      ? user.profile_data
      : {};
    const documentExpiries =
      profileData.document_expiries && typeof profileData.document_expiries === 'object'
        ? (profileData.document_expiries as Record<string, { valid_until?: string; number?: string }>)
        : {};
    const verificationDocs =
      profileData.verification_documents && typeof profileData.verification_documents === 'object'
        ? (profileData.verification_documents as Record<string, any>)
        : {};
    const entered =
      verificationDocs.ngo?.entered_fields && typeof verificationDocs.ngo.entered_fields === 'object'
        ? verificationDocs.ngo.entered_fields
        : {};

    setFormData((prev) => ({
      ...prev,
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
    }));
    setDidSyncUserDefaults(true);
  }, [mounted, user, didSyncUserDefaults]);

  useEffect(() => {
    if (!mounted || authLoading) {
      return;
    }

    if (!user) {
      smoothNavigate(router, '/login', { delay: 0 });
    }
  }, [mounted, authLoading, user, router]);

  const [documentFiles, setDocumentFiles] = useState<Record<DocumentKey, File | null>>(
    allDocumentKeys.reduce((acc, key) => {
      acc[key] = null;
      return acc;
    }, {} as Record<DocumentKey, File | null>)
  );

  const [uploadedUrls, setUploadedUrls] = useState<Record<DocumentKey, string>>(
    allDocumentKeys.reduce((acc, key) => {
      acc[key] = '';
      return acc;
    }, {} as Record<DocumentKey, string>)
  );

  const requiredDocs = useMemo(() => {
    if (formData.category === 'individual') {
      return ['individualAadhaar', 'individualPanCard', 'bankStatement'] as DocumentKey[];
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
    ] as DocumentKey[];
  }, [
    formData.category,
    formData.companyGstApplicable,
    formData.ngoFcraRegistrationNumber,
    formData.ngoTwelveANumber,
    formData.ngoEightyGNumber,
    formData.ngoCsr1RegistrationNumber,
  ]);

  const visibleDocs = useMemo(() => {
    if (formData.category === 'individual') {
      return ['individualAadhaar', 'individualPanCard', 'bankStatement'] as DocumentKey[];
    }

    if (formData.category === 'ngo') {
      return requiredDocs;
    }

    return [
      'companyIncorporationCertificate',
      'companyPanCard',
      'companyAddressProof',
      'bankStatement',
      ...(formData.companyGstApplicable ? (['companyGstCertificate'] as DocumentKey[]) : [])
    ] as DocumentKey[];
  }, [formData.category, formData.companyGstApplicable, requiredDocs]);

  const handleBack = () => {
    if (user?.user_type === 'individual') {
      smoothNavigate(router, '/individuals/dashboard#top', { delay: 150 });
      return;
    }

    if (user?.user_type === 'ngo') {
      smoothNavigate(router, '/ngos/dashboard#top', { delay: 150 });
      return;
    }

    if (user?.user_type === 'company') {
      smoothNavigate(router, '/companies/dashboard#top', { delay: 150 });
      return;
    }

    router.back();
  };

  const persistEmailVerification = async () => {
    if (!user?.id) return false;
    const verifiedAt = new Date().toISOString();

    const response = await fetch('/api/profile/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: user.id,
        email_verified: true,
        email_verified_at: verifiedAt
      })
    });

    if (!response.ok) {
      return false;
    }

    setAuthSnapshot((prev) => ({
      ...(prev || {}),
      email_verified: true
    }));
    return true;
  };

  const validateStepOne = () => {
    if (!formData.entityName || !formData.email) {
      setError('Please fill name and email.');
      return false;
    }

    if (PHONE_VERIFICATION_ENABLED && !formData.contactNumber) {
      setError('Please fill name, contact number, and email.');
      return false;
    }

    if (!isEmailVerified) {
      setError('Email verification is mandatory for all verification types. Please verify your email first.');
      return false;
    }

    if (formData.category === 'individual') {
      if (!/^\d{12}$/.test(formData.aadhaarNumber.replace(/\s/g, '')) || !formData.panNumber) {
        setError('Please enter a 12-digit Aadhaar number and PAN number.');
        return false;
      }
      return true;
    }

    if (formData.category === 'ngo') {
      if (!formData.panNumber || !formData.registrationNumber || !formData.ngoAssociationNumber) {
        setError('Please fill registration number, PAN number, and association number.');
        return false;
      }

      const fcraNumber = formData.ngoFcraRegistrationNumber.trim();
      const twelveANumber = formData.ngoTwelveANumber.trim();
      const eightyGNumber = formData.ngoEightyGNumber.trim();
      const csr1Number = formData.ngoCsr1RegistrationNumber.trim();

      if (fcraNumber && !formData.ngoFcraExpiryDate.trim()) {
        setError('FCRA expiry date is required when the FCRA registration number is provided.');
        return false;
      }
      if (twelveANumber && !formData.ngoTwelveAExpiryDate.trim()) {
        setError('12A expiry date is required when the 12A number is provided.');
        return false;
      }
      if (eightyGNumber && !formData.ngoEightyGExpiryDate.trim()) {
        setError('80G expiry date is required when the 80G number is provided.');
        return false;
      }
      if (csr1Number && !formData.ngoCsr1ExpiryDate.trim()) {
        setError('CSR-1 expiry date is required when the CSR-1 number is provided.');
        return false;
      }
      return true;
    }

    if (!formData.panNumber || !formData.registrationNumber || !formData.companyCinNumber) {
      setError('Please fill company registration number, PAN number, and CIN number.');
      return false;
    }

    if (formData.companyGstApplicable && !formData.companyGstNumber.trim()) {
      setError('Please enter the GST number, or uncheck GST applicable.');
      return false;
    }

    return true;
  };

  const validateStepTwo = () => {
    const missing = requiredDocs.find((key) => !documentFiles[key] && !uploadedUrls[key]);
    if (missing) {
      setError(`Please upload ${documentLabels[missing]}.`);
      return false;
    }

    return true;
  };

  const handleFileChange = (key: DocumentKey, fileList: FileList | null) => {
    setError(null);
    if (!fileList || fileList.length === 0) {
      return;
    }

    const selectedFile = fileList[0];
    setDocumentFiles((prev) => ({ ...prev, [key]: selectedFile }));
  };

  const uploadSingleFile = async (file: File, key: DocumentKey) => {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Authentication required. Please log in again.');
    }

    const body = new FormData();
    body.append('file', file);
    body.append('documentKey', key);
    body.append('category', formData.category);

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
  };

  const submitVerification = async () => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      if (!validateStepOne() || !validateStepTwo()) {
        return;
      }

      const uploaded = { ...uploadedUrls };
      for (const key of visibleDocs) {
        const file = documentFiles[key];
        if (!file) continue;
        uploaded[key] = await uploadSingleFile(file, key);
      }
      setUploadedUrls(uploaded);

      const token = localStorage.getItem('token');
      if (!token || !user?.user_type) {
        throw new Error('Authentication required. Please log in again.');
      }

      const verificationEndpoint = `/api/verification/${user.user_type}`;

      const submittedDocuments = visibleDocs.reduce((acc, key) => {
        if (uploaded[key]) {
          acc[key] = uploaded[key];
        }
        return acc;
      }, {} as Record<string, string>);

      const initiatePayload: Record<string, any> = {
        action: reverifyMode ? 'reverify' : 'initiate',
        documents: submittedDocuments,
      };
      if (user.user_type === 'ngo') {
        initiatePayload.organizationName = formData.entityName;
        initiatePayload.registrationNumber = formData.registrationNumber;
        initiatePayload.registrationType = formData.ngoRegistrationType;
        initiatePayload.panNumber = formData.panNumber;
        initiatePayload.fcraNumber = formData.ngoFcraRegistrationNumber;
        initiatePayload.fcraExpiryDate = formData.ngoFcraExpiryDate;
        initiatePayload.twelveAExpiryDate = formData.ngoTwelveAExpiryDate || undefined;
        initiatePayload.eightyGExpiryDate = formData.ngoEightyGExpiryDate || undefined;
        initiatePayload.csr1ExpiryDate = formData.ngoCsr1ExpiryDate || undefined;
        initiatePayload.complianceDocuments = {
          twelve_a: uploaded.ngoTwelveACertificate,
          eighty_g: uploaded.ngoEightyGCertificate,
          csr1: uploaded.ngoCsr1Certificate,
        };
        initiatePayload.complianceNumbers = {
          twelve_a_number: formData.ngoTwelveANumber.trim(),
          eighty_g_number: formData.ngoEightyGNumber.trim(),
          csr1_registration_number: formData.ngoCsr1RegistrationNumber.trim(),
        };
      } else if (user.user_type === 'company') {
        initiatePayload.companyName = formData.entityName;
        initiatePayload.cinNumber = formData.companyCinNumber || formData.registrationNumber;
        initiatePayload.registrationNumber = formData.registrationNumber;
        initiatePayload.panNumber = formData.panNumber;
        initiatePayload.gstNumber = formData.companyGstApplicable ? formData.companyGstNumber.trim().toUpperCase() : '';
        initiatePayload.companyType = 'Registered Company';
      } else {
        initiatePayload.documentType = 'aadhaar';
        initiatePayload.aadhaarNumber = formData.aadhaarNumber.replace(/\s/g, '');
        initiatePayload.panNumber = formData.panNumber.trim().toUpperCase();
      }

      const initiateResponse = await fetch(verificationEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(initiatePayload)
      });

      const initiateResult = await initiateResponse.json();
      if (!initiateResponse.ok) {
        throw new Error(initiateResult.error || 'Failed to initiate verification');
      }

      if (reverifyMode) {
        setReverifyMode(false);
        setReverificationPending(true);
        setAuthSnapshot((prev) => ({
          ...(prev || {}),
          verification_status: 'verified',
          reverification_pending: true
        }));
        setSuccess(initiateResult.message || 'Reverification submitted. You remain verified while your updated documents are reviewed.');
        setCurrentStep(1);
        setDocumentFiles(
          allDocumentKeys.reduce((acc, key) => {
            acc[key] = null;
            return acc;
          }, {} as Record<DocumentKey, File | null>)
        );
        return;
      }

      setSuccess('Verification details submitted successfully. Documents uploaded as per your verification type.');
    } catch (submissionError: any) {
      setError(submissionError?.message || 'Failed to submit verification details. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!mounted || authLoading) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-600">Loading verification dashboard...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Please log in to access the verification dashboard.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isFullyVerified && !reverifyMode) {
    const expirySummary =
      user?.user_type === 'ngo' ? summarizeDocumentExpiries(user.profile_data) : null;
    const caBadgeNumber =
      visibleCaBadgeNumber(user.verification_status, user.profile_data || user.profile) ||
      user.ca_badge_number ||
      null;

    return (
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
              <CheckCircle className="h-5 w-5 shrink-0 text-green-600" />
              <span>You're all set</span>
              <VerificationBadge
                status="verified"
                size="xl"
                showText={false}
                badgeNumber={caBadgeNumber}
                className="max-w-full min-w-0"
              />
            </CardTitle>
            <CardDescription>
              {caBadgeNumber
                ? 'Your documents are CA-verified.'
                : 'Your email and document verification are already complete.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {reverificationPending && (
              <Alert>
                <AlertDescription>
                  Your reverification request is under review. You remain verified while we review your updated documents.
                </AlertDescription>
              </Alert>
            )}
            {(expirySummary?.has_expired || expirySummary?.has_due_soon) && !reverificationPending ? (
              <Alert>
                <AlertDescription>
                  {expirySummary.has_expired
                    ? expirySummary.soonest
                      ? `${expirySummary.soonest.label} expired on ${formatDisplayDate(
                          expirySummary.soonest.valid_until
                        )}. The matching CA tag has been dropped. Reverify with an updated certificate to restore it. You stay verified.`
                      : 'A compliance certificate has expired and its CA tag was dropped. Reverify with an updated certificate to restore it.'
                    : expirySummary.soonest
                      ? `${expirySummary.soonest.label} expires on ${formatDisplayDate(
                          expirySummary.soonest.valid_until
                        )}. Reverify with an updated certificate before it lapses, or the matching CA tag will be dropped.`
                      : 'A compliance certificate is expiring soon. Reverify before it lapses.'}
                </AlertDescription>
              </Alert>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <Button onClick={handleBack}>Back to Dashboard</Button>
              {!reverificationPending && (
                <Button
                  variant="outline"
                  className="border-udaan-orange text-udaan-orange hover:bg-orange-50"
                  onClick={() => {
                    setReverifyMode(true);
                    setSuccess(null);
                    setError(null);
                    setCurrentStep(1);
                  }}
                >
                  {expirySummary?.has_expired
                    ? 'Restore expired certificate'
                    : expirySummary?.has_due_soon
                      ? 'Update expiring documents'
                      : 'Reverify documents'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          onClick={handleBack}
          className="text-gray-600 hover:text-gray-900 hover:bg-transparent active:bg-transparent focus-visible:bg-transparent focus-visible:ring-0"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      </div>

      <div>
        <h1 className="text-3xl font-bold">{reverifyMode ? 'Reverify documents' : 'Verification'}</h1>
        <p className="text-gray-600">
          {reverifyMode
            ? 'Upload updated documents for review. You will stay verified while your reverification is processed.'
            : 'Complete both pages to submit your verification request.'}
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Step {currentStep} of 2
                </p>
                <p className="mt-1 text-sm font-medium text-slate-800">
                  {currentStep === 1 ? 'Add your details' : 'Upload documents'}
                </p>
              </div>
              <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-udaan-orange">
                {progressValue}%
              </span>
            </div>

            <Progress
              value={progressValue}
              className="h-2.5 overflow-hidden rounded-full bg-slate-100 shadow-inner [&>div]:rounded-full [&>div]:bg-gradient-to-r [&>div]:from-udaan-orange [&>div]:to-orange-400 [&>div]:transition-transform [&>div]:duration-500 [&>div]:ease-out"
            />

            <div className="flex flex-col gap-2 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <p className="capitalize">
                Verification type: <span className="font-medium text-slate-700">{formData.category}</span>
              </p>
              <div className="flex items-center gap-2">
                <span className={currentStep >= 1 ? 'font-medium text-udaan-orange' : ''}>Details</span>
                <span className="h-1 w-1 rounded-full bg-slate-300" aria-hidden="true" />
                <span className={currentStep >= 2 ? 'font-medium text-udaan-orange' : ''}>Documents</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-700">{success}</AlertDescription>
        </Alert>
      )}

      {currentStep === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Add Details
            </CardTitle>
            <CardDescription>
              Fill all required details for your verification type.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="entityName">Full Name</Label>
                <Input
                  id="entityName"
                  value={formData.entityName}
                  onChange={(e) => setFormData((prev) => ({ ...prev, entityName: e.target.value }))}
                  placeholder="Enter name"
                />
              </div>
              {PHONE_VERIFICATION_ENABLED ? (
                <div className="space-y-2">
                  <Label htmlFor="contactNumber">Contact Number</Label>
                  <Input
                    id="contactNumber"
                    value={formData.contactNumber}
                    onChange={(e) => setFormData((prev) => ({ ...prev, contactNumber: e.target.value }))}
                    placeholder="Enter contact number"
                  />
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="Enter email"
              />
            </div>

            <div className="rounded-md border p-3 bg-gray-50 text-sm text-gray-700 space-y-3">
              <div>
                <p>
                  Email verification:{' '}
                  <span className="font-medium">{isEmailVerified ? 'Verified' : 'Not Verified'}</span>
                </p>
                {!isEmailVerified && (
                  <div className="mt-2 space-y-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleSendEmailOtp(formData.email)}
                      disabled={otpSending.email || otpCooldown.email > 0}
                    >
                      {otpSending.email
                        ? 'Sending...'
                        : otpCooldown.email > 0
                          ? `Resend in ${otpCooldown.email}s`
                          : otpSent.email
                            ? 'Resend OTP'
                            : 'Verify Email'}
                    </Button>
                    {formErrors.email && <p className="text-sm text-red-500">{formErrors.email}</p>}
                    {otpSent.email && (
                      <div className="space-y-2">
                        <Input
                          value={otpInput.email}
                          onChange={(e) => setOtpInput((prev) => ({ ...prev, email: e.target.value }))}
                          placeholder="Enter OTP"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            const ok = await handleVerifyEmailOtp(formData.email, otpInput.email);
                            if (ok) {
                              await persistEmailVerification();
                              setError(null);
                            }
                          }}
                          disabled={otpVerifying.email}
                        >
                          {otpVerifying.email ? 'Verifying...' : 'Verify OTP'}
                        </Button>
                        {formErrors.emailOtp && <p className="text-sm text-red-500">{formErrors.emailOtp}</p>}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {PHONE_VERIFICATION_ENABLED ? (
              <div>
                <p>
                  Phone OTP verification:{' '}
                  <span className="font-medium">{isPhoneVerified ? 'Verified' : 'Not Verified'}</span>
                </p>
                {!isPhoneVerified && (
                  <div className="mt-2 space-y-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleSendPhoneOtp(formData.contactNumber)}
                      disabled={otpSending.phone || otpCooldown.phone > 0}
                    >
                      {otpSending.phone
                        ? 'Sending...'
                        : otpCooldown.phone > 0
                          ? `Resend in ${otpCooldown.phone}s`
                          : otpSent.phone
                            ? 'Resend OTP'
                            : 'Verify Mobile'}
                    </Button>
                    {formErrors.phone && <p className="text-sm text-red-500">{formErrors.phone}</p>}
                    {otpSent.phone && (
                      <Input
                        value={otpInput.phone}
                        onChange={(e) => setOtpInput((prev) => ({ ...prev, phone: e.target.value }))}
                        placeholder="Enter OTP"
                      />
                    )}
                  </div>
                )}
              </div>
              ) : null}
            </div>

            {/* Message removed as requested */}

            {formData.category === 'individual' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="aadhaarNumber">Aadhaar Number *</Label>
                  <Input
                    id="aadhaarNumber"
                    value={formData.aadhaarNumber}
                    maxLength={12}
                    onChange={(e) => setFormData((prev) => ({ ...prev, aadhaarNumber: e.target.value.replace(/\D/g, '') }))}
                    placeholder="12-digit Aadhaar number"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="individualPanNumber">PAN Number *</Label>
                  <Input
                    id="individualPanNumber"
                    value={formData.panNumber}
                    maxLength={10}
                    onChange={(e) => setFormData((prev) => ({ ...prev, panNumber: e.target.value.toUpperCase() }))}
                    placeholder="ABCDE1234F"
                  />
                </div>
              </div>
            )}

            {formData.category === 'ngo' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Registration Type *</Label>
                    <Select
                      value={formData.ngoRegistrationType}
                      onValueChange={(value) =>
                        setFormData((prev) => ({ ...prev, ngoRegistrationType: value as NgoRegistrationType }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select registration type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Trust">Trust</SelectItem>
                        <SelectItem value="Society">Society</SelectItem>
                        <SelectItem value="Section 8">Section 8</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ngoRegistrationNumber">Registration Certificate Number *</Label>
                    <Input
                      id="ngoRegistrationNumber"
                      value={formData.registrationNumber}
                      onChange={(e) => setFormData((prev) => ({ ...prev, registrationNumber: e.target.value }))}
                      placeholder="Enter registration certificate number"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="ngoPanNumber">PAN Number *</Label>
                    <Input
                      id="ngoPanNumber"
                      value={formData.panNumber}
                      maxLength={10}
                      onChange={(e) => setFormData((prev) => ({ ...prev, panNumber: e.target.value.toUpperCase() }))}
                      placeholder="ABCDE1234F"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ngoFcraRegistrationNumber">FCRA Registration Number (optional)</Label>
                    <Input
                      id="ngoFcraRegistrationNumber"
                      value={formData.ngoFcraRegistrationNumber}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, ngoFcraRegistrationNumber: e.target.value }))
                      }
                      placeholder="Enter FCRA registration number"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="ngoFcraExpiryDate">
                      FCRA Expiry Date{formData.ngoFcraRegistrationNumber.trim() ? ' *' : ''}
                    </Label>
                    <Input
                      id="ngoFcraExpiryDate"
                      type="date"
                      value={formData.ngoFcraExpiryDate}
                      onChange={(e) => setFormData((prev) => ({ ...prev, ngoFcraExpiryDate: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ngoAssociationNumber">Association Number *</Label>
                    <Input
                      id="ngoAssociationNumber"
                      value={formData.ngoAssociationNumber}
                      onChange={(e) => setFormData((prev) => ({ ...prev, ngoAssociationNumber: e.target.value }))}
                      placeholder="Enter association number"
                    />
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                  <div>
                    <p className="text-sm font-medium text-slate-900">Optional compliance registration numbers</p>
                    <p className="text-xs text-muted-foreground">
                      Add 12A, 80G, CSR-1, or FCRA only if you have them. The CA will allot tags for certificates that
                      are present and not expired. CSR recommendations and company CSR payments require a live CSR-1 tag.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="ngoTwelveANumber">12A Number (optional)</Label>
                      <Input
                        id="ngoTwelveANumber"
                        value={formData.ngoTwelveANumber}
                        onChange={(e) => setFormData((prev) => ({ ...prev, ngoTwelveANumber: e.target.value }))}
                        placeholder="Enter 12A approval/reference number"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ngoTwelveAExpiryDate">
                        12A Expiry Date{formData.ngoTwelveANumber.trim() ? ' *' : ''}
                      </Label>
                      <Input
                        id="ngoTwelveAExpiryDate"
                        type="date"
                        value={formData.ngoTwelveAExpiryDate}
                        onChange={(e) => setFormData((prev) => ({ ...prev, ngoTwelveAExpiryDate: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ngoEightyGNumber">80G Number (optional)</Label>
                      <Input
                        id="ngoEightyGNumber"
                        value={formData.ngoEightyGNumber}
                        onChange={(e) => setFormData((prev) => ({ ...prev, ngoEightyGNumber: e.target.value }))}
                        placeholder="Enter 80G certificate reference"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ngoEightyGExpiryDate">
                        80G Expiry Date{formData.ngoEightyGNumber.trim() ? ' *' : ''}
                      </Label>
                      <Input
                        id="ngoEightyGExpiryDate"
                        type="date"
                        value={formData.ngoEightyGExpiryDate}
                        onChange={(e) => setFormData((prev) => ({ ...prev, ngoEightyGExpiryDate: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ngoCsr1RegistrationNumber">CSR-1 Registration Number (optional)</Label>
                      <Input
                        id="ngoCsr1RegistrationNumber"
                        value={formData.ngoCsr1RegistrationNumber}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, ngoCsr1RegistrationNumber: e.target.value }))
                        }
                        placeholder="Enter CSR-1 acknowledgment or registration number"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ngoCsr1ExpiryDate">
                        CSR-1 Expiry Date{formData.ngoCsr1RegistrationNumber.trim() ? ' *' : ''}
                      </Label>
                      <Input
                        id="ngoCsr1ExpiryDate"
                        type="date"
                        value={formData.ngoCsr1ExpiryDate}
                        onChange={(e) => setFormData((prev) => ({ ...prev, ngoCsr1ExpiryDate: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            {formData.category === 'company' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="companyRegistrationNumber">Registration / Incorporation Number</Label>
                    <Input
                      id="companyRegistrationNumber"
                      value={formData.registrationNumber}
                      onChange={(e) => setFormData((prev) => ({ ...prev, registrationNumber: e.target.value }))}
                      placeholder="Enter registration number"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="companyPanNumber">PAN Number</Label>
                    <Input
                      id="companyPanNumber"
                      value={formData.panNumber}
                      maxLength={10}
                      onChange={(e) => setFormData((prev) => ({ ...prev, panNumber: e.target.value.toUpperCase() }))}
                      placeholder="ABCDE1234F"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="companyCinNumber">CIN Number *</Label>
                    <Input
                      id="companyCinNumber"
                      value={formData.companyCinNumber}
                      onChange={(e) => setFormData((prev) => ({ ...prev, companyCinNumber: e.target.value.toUpperCase() }))}
                      placeholder="L99999MH2020PTC123456"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="companyGstApplicable">GST Applicable</Label>
                    <div className="h-10 flex items-center gap-2 px-3 border rounded-md">
                      <Input
                        id="companyGstApplicable"
                        type="checkbox"
                        checked={formData.companyGstApplicable}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, companyGstApplicable: e.target.checked }))
                        }
                        className="w-4 h-4"
                      />
                      <span className="text-sm text-gray-700">Upload GST Certificate if applicable</span>
                    </div>
                  </div>
                </div>
                {formData.companyGstApplicable && (
                  <div className="space-y-2">
                    <Label htmlFor="companyGstNumber">GST Number *</Label>
                    <Input
                      id="companyGstNumber"
                      value={formData.companyGstNumber}
                      maxLength={15}
                      onChange={(e) => setFormData((prev) => ({ ...prev, companyGstNumber: e.target.value.toUpperCase() }))}
                      placeholder="22AAAAA0000A1Z5"
                    />
                  </div>
                )}
              </>
            )}

            <div className="flex justify-end">
              <Button
                onClick={() => {
                  setError(null);
                  if (validateStepOne()) {
                    setCurrentStep(2);
                  }
                }}
              >
                Continue to Uploads
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {currentStep === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>
              Upload Documents
            </CardTitle>
            <CardDescription>
              Upload required documents based on your verification type. A bank statement for the last 6 months is required.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {visibleDocs.map((docKey) => (
              <div key={docKey} className="space-y-2">
                <Label htmlFor={docKey}>
                  {documentLabels[docKey]}
                  {requiredDocs.includes(docKey) ? ' *' : ' (Optional)'}
                </Label>
                <Input
                  id={docKey}
                  type="file"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  className="h-auto cursor-pointer border border-gray-200 bg-gray-50/80 py-2.5 file:mr-4 file:cursor-pointer file:rounded-md file:border-0 file:bg-udaan-orange file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-udaan-orange/90"
                  onChange={(e) => handleFileChange(docKey, e.target.files)}
                />
                {documentFiles[docKey] && (
                  <p className="text-sm text-gray-600 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    {documentFiles[docKey]?.name}
                  </p>
                )}
                {!!uploadedUrls[docKey] && (
                  <p className="text-xs text-green-600">Uploaded successfully</p>
                )}
              </div>
            ))}

            <div className="flex items-center justify-between pt-2">
              <Button variant="outline" onClick={() => setCurrentStep(1)} disabled={loading} className="hover:bg-transparent active:bg-transparent focus-visible:bg-transparent focus-visible:ring-0">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button onClick={submitVerification} disabled={loading}>
                {loading ? 'Submitting...' : reverifyMode ? 'Submit reverification' : 'Submit Verification'}
              </Button>
              {reverifyMode && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={loading}
                  onClick={() => {
                    setReverifyMode(false);
                    setError(null);
                    setSuccess(null);
                    setCurrentStep(1);
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
