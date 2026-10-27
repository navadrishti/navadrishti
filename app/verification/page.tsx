'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useIsClient } from '@/hooks/use-is-client';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useOtpSender } from '@/hooks/use-otp-sender';
import { smoothNavigate, smoothScrollToElement, getErrorMessage } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, AlertTriangle, CheckCircle } from 'lucide-react';
import { ContactVerificationSection } from './contact-verification-section';
import { DetailsStep } from './details-step';
import { DocumentsStep } from './documents-step';
import {
  buildInitiatePayload,
  createDocumentMap,
  dashboardPathFor,
  documentLabels,
  getDetailsError,
  getRequiredDocs,
  getUserFormDefaults,
  initialFormData,
  resolveCategory,
  uploadVerificationDocument
} from './helpers';
import { StepProgressCard } from './step-progress-card';
import type { DocumentKey, FormErrors, Step, VerificationFormData } from './types';
import { useVerificationStatus } from './use-verification-status';
import { VerifiedSummaryCard } from './verified-summary-card';
import { SubmittedReviewCard } from './submitted-review-card';
import { VerificationReviewDialog } from '@/components/verification-review-dialog';
import { getVerificationReviewNotice } from '@/lib/verification-review-notice';
import { getVerificationDashboardView } from '@/lib/verification-dashboard-view';

export default function VerificationPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const mounted = useIsClient();
  const [reverifyMode, setReverifyMode] = useState(false);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [otpInput, setOtpInput] = useState({ email: '', phone: '' });
  const otp = useOtpSender(setFormErrors);
  const { authSnapshot, setAuthSnapshot, reverificationPending, setReverificationPending } =
    useVerificationStatus(mounted, otp.otpVerified.email, user?.user_type);

  const baseEmailVerified = authSnapshot?.email_verified ?? user?.email_verified ?? false;
  const isEmailVerified = mounted ? Boolean(baseEmailVerified || otp.otpVerified.email) : false;
  const isPhoneVerified = mounted ? Boolean(authSnapshot?.phone_verified ?? user?.phone_verified ?? false) : false;
  const documentVerificationStatus = authSnapshot?.verification_status ?? user?.verification_status ?? 'unverified';

  const [formData, setFormData] = useState<VerificationFormData>(initialFormData);
  const [didSyncUserDefaults, setDidSyncUserDefaults] = useState(false);
  const [documentFiles, setDocumentFiles] = useState(() => createDocumentMap<File | null>(null));
  const [uploadedUrls, setUploadedUrls] = useState(() => createDocumentMap(''));
  const pageTopRef = useRef<HTMLDivElement>(null);

  if (mounted && user && !didSyncUserDefaults) {
    setDidSyncUserDefaults(true);
    setFormData((prev) => ({ ...prev, ...getUserFormDefaults(user) }));
  }

  useEffect(() => {
    if (!mounted || authLoading) {
      return;
    }

    if (!user) {
      smoothNavigate(router, '/login', { delay: 0 });
    }
  }, [mounted, authLoading, user, router]);

  useEffect(() => {
    if (!success) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    smoothScrollToElement('verification-top', { offset: 96, delay: 40, duration: 500 });
  }, [success]);

  const requiredDocs = useMemo(() => getRequiredDocs(formData), [formData]);

  const handleBack = () => {
    const dashboardPath = dashboardPathFor(user?.user_type);
    if (dashboardPath) {
      smoothNavigate(router, dashboardPath, { delay: 150 });
      return;
    }

    router.back();
  };

  const validateStepOne = () => {
    const message = getDetailsError(formData, isEmailVerified);
    if (message) {
      setError(message);
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

  const resetToFirstStep = () => {
    setSuccess(null);
    setError(null);
    setCurrentStep(1);
  };

  const emptyFormAfterSubmit = (message: string) => {
    setError(null);
    setFormErrors({});
    setOtpInput({ email: '', phone: '' });
    setCurrentStep(1);
    setDocumentFiles(createDocumentMap<File | null>(null));
    setUploadedUrls(createDocumentMap(''));
    setFormData({
      ...initialFormData,
      category: resolveCategory(user?.user_type),
      entityName: user?.name || '',
      email: user?.email || '',
      contactNumber: user?.phone || '',
    });
    setSuccess(message);
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
      for (const key of requiredDocs) {
        const file = documentFiles[key];
        if (!file) continue;
        uploaded[key] = await uploadVerificationDocument(file, key, formData.category);
      }
      setUploadedUrls(uploaded);

      const token = localStorage.getItem('token');
      if (!token || !user?.user_type) {
        throw new Error('Authentication required. Please log in again.');
      }

      const submittedDocuments = requiredDocs.reduce<Record<string, string>>((acc, key) => {
        if (uploaded[key]) {
          acc[key] = uploaded[key];
        }
        return acc;
      }, {});

      const initiateResponse = await fetch(`/api/verification/${user.user_type}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(
          buildInitiatePayload(user.user_type, formData, uploaded, submittedDocuments, reverifyMode)
        )
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
      } else {
        setAuthSnapshot((prev) => ({
          ...(prev || {}),
          verification_status: 'pending',
        }));
      }
      emptyFormAfterSubmit(
        initiateResult.message ||
          (reverifyMode
            ? 'Reverification submitted. You remain verified while your updated documents are reviewed.'
            : 'Verification submitted successfully. A CA will review your documents. Check back here for your verified badge.')
      );
    } catch (submissionError) {
      setError(getErrorMessage(submissionError) || 'Failed to submit verification details. Please try again.');
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

  const reviewNotice = getVerificationReviewNotice({
    userType: user.user_type,
    verificationStatus: documentVerificationStatus,
    profileData: user.profile_data || user.profile,
    reverificationPending,
  });
  const dashboardView = getVerificationDashboardView({
    reverifyMode,
    verificationStatus: documentVerificationStatus,
    justSubmitted: Boolean(success),
    reverificationPending,
  });
  const remainVerified =
    documentVerificationStatus === 'verified' || Boolean(reverificationPending);

  const beginReverify = () => {
    setReverifyMode(true);
    resetToFirstStep();
    setDocumentFiles(createDocumentMap<File | null>(null));
    setUploadedUrls(createDocumentMap(''));
    setFormData({
      ...initialFormData,
      ...getUserFormDefaults(user),
    });
  };

  if (dashboardView === 'verified_summary') {
    return (
      <>
        <VerifiedSummaryCard
          user={user}
          reverificationPending={reverificationPending}
          reviewNotice={reviewNotice}
          onBack={handleBack}
          onStartReverify={beginReverify}
        />
        <VerificationReviewDialog
          notice={reviewNotice}
          applyLabel="Apply for reverification"
          onApply={beginReverify}
        />
      </>
    );
  }

  if (dashboardView === 'submitted_review') {
    return (
      <SubmittedReviewCard
        title={
          success
            ? remainVerified
              ? 'Reverification submitted'
              : 'Verification submitted'
            : remainVerified
              ? 'Reverification under review'
              : 'Verification under review'
        }
        description={
          success ||
          (remainVerified
            ? 'Your updated documents were submitted successfully. A CA will review them. You remain verified.'
            : 'Your form was submitted successfully. A CA will review your documents.')
        }
        remainVerified={remainVerified}
        onBack={handleBack}
      />
    );
  }

  return (
    <div id="verification-top" ref={pageTopRef} className="max-w-4xl mx-auto p-6 space-y-6">
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

      {success && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-700">{success}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <StepProgressCard currentStep={currentStep} category={formData.category} />

      {currentStep === 1 && (
        <DetailsStep
          formData={formData}
          setFormData={setFormData}
          contactVerification={
            <ContactVerificationSection
              otp={otp}
              formErrors={formErrors}
              otpInput={otpInput}
              setOtpInput={setOtpInput}
              email={formData.email}
              contactNumber={formData.contactNumber}
              isEmailVerified={isEmailVerified}
              isPhoneVerified={isPhoneVerified}
              onEmailVerified={() => {
                setAuthSnapshot((prev) => ({ ...(prev || {}), email_verified: true }));
                setError(null);
              }}
              onPhoneVerified={() => {
                setAuthSnapshot((prev) => ({ ...(prev || {}), phone_verified: true }));
                setError(null);
              }}
            />
          }
          onContinue={() => {
            setError(null);
            if (validateStepOne()) {
              setCurrentStep(2);
            }
          }}
        />
      )}

      {currentStep === 2 && (
        <DocumentsStep
          documentKeys={requiredDocs}
          documentFiles={documentFiles}
          uploadedUrls={uploadedUrls}
          loading={loading}
          reverifyMode={reverifyMode}
          onFileChange={handleFileChange}
          onBack={() => setCurrentStep(1)}
          onSubmit={submitVerification}
          onCancelReverify={() => {
            setReverifyMode(false);
            resetToFirstStep();
          }}
        />
      )}

      <VerificationReviewDialog
        notice={reverifyMode ? null : reviewNotice}
        applyLabel={reviewNotice?.kind === 'reverification_rejected' ? 'Apply for reverification' : 'Apply again'}
        onApply={() => {
          if (reviewNotice?.kind === 'reverification_rejected') {
            beginReverify();
            return;
          }
          resetToFirstStep();
        }}
      />
    </div>
  );
}
