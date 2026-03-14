'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { smoothNavigate } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, AlertTriangle, CheckCircle, FileText, Shield, Upload, User } from 'lucide-react';

type VerificationCategory = 'individual' | 'ngo' | 'company';
type Step = 1 | 2;
type IndividualIdType = 'aadhaar' | 'pan' | 'voter-id' | 'driving-license';
type NgoRegistrationType = 'Trust' | 'Society' | 'Section 8';

type DocumentKey =
  | 'individualOptionalId'
  | 'ngoRegistrationCertificate'
  | 'ngoPanCard'
  | 'ngoAddressProof'
  | 'ngoTrustOrMoaAoa'
  | 'ngoFcraPhoto'
  | 'companyIncorporationCertificate'
  | 'companyPanCard'
  | 'companyGstCertificate'
  | 'companyAddressProof'
  | 'companyBoardResolution';

const documentLabels: Record<DocumentKey, string> = {
  individualOptionalId: 'Optional ID Upload (Aadhaar / PAN / Voter ID / Driving License)',
  ngoRegistrationCertificate: 'Registration Certificate (Trust / Society / Section 8)',
  ngoPanCard: 'PAN Card of NGO',
  ngoAddressProof: 'Address Proof (utility bill / rent agreement / bank letter)',
  ngoTrustOrMoaAoa: 'Trust Deed / MOA / AOA',
  ngoFcraPhoto: 'FCRA Registration Document Photo',
  companyIncorporationCertificate: 'Certificate of Incorporation',
  companyPanCard: 'PAN Card of Company',
  companyGstCertificate: 'GST Certificate (if applicable)',
  companyAddressProof: 'Company Address Proof',
  companyBoardResolution: 'Board Resolution (optional for large CSR projects)'
};

interface VerificationFormData {
  entityName: string;
  contactNumber: string;
  email: string;
  category: VerificationCategory;
  panNumber: string;
  registrationNumber: string;
  ngoRegistrationType: NgoRegistrationType;
  ngoFcraRegistrationNumber: string;
  ngoFcraExpiryDate: string;
  ngoAssociationNumber: string;
  companyCinNumber: string;
  companyGstApplicable: boolean;
  individualIdType: IndividualIdType;
}

const allDocumentKeys: DocumentKey[] = [
  'individualOptionalId',
  'ngoRegistrationCertificate',
  'ngoPanCard',
  'ngoAddressProof',
  'ngoTrustOrMoaAoa',
  'ngoFcraPhoto',
  'companyIncorporationCertificate',
  'companyPanCard',
  'companyGstCertificate',
  'companyAddressProof',
  'companyBoardResolution'
];

export default function VerificationPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const category: VerificationCategory = user?.user_type === 'ngo' ? 'ngo' : user?.user_type === 'company' ? 'company' : 'individual';

  const [formData, setFormData] = useState<VerificationFormData>({
    entityName: user?.name || '',
    contactNumber: user?.phone || '',
    email: user?.email || '',
    category,
    panNumber: '',
    registrationNumber: '',
    ngoRegistrationType: 'Trust',
    ngoFcraRegistrationNumber: '',
    ngoFcraExpiryDate: '',
    ngoAssociationNumber: '',
    companyCinNumber: '',
    companyGstApplicable: false,
    individualIdType: 'aadhaar'
  });

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
      return [] as DocumentKey[];
    }

    if (formData.category === 'ngo') {
      return [
        'ngoRegistrationCertificate',
        'ngoPanCard',
        'ngoAddressProof',
        'ngoTrustOrMoaAoa',
        'ngoFcraPhoto'
      ] as DocumentKey[];
    }

    return [
      'companyIncorporationCertificate',
      'companyPanCard',
      'companyAddressProof',
      ...(formData.companyGstApplicable ? (['companyGstCertificate'] as DocumentKey[]) : [])
    ] as DocumentKey[];
  }, [formData.category, formData.companyGstApplicable]);

  const visibleDocs = useMemo(() => {
    if (formData.category === 'individual') {
      return ['individualOptionalId'] as DocumentKey[];
    }

    if (formData.category === 'ngo') {
      return [
        'ngoRegistrationCertificate',
        'ngoPanCard',
        'ngoAddressProof',
        'ngoTrustOrMoaAoa',
        'ngoFcraPhoto'
      ] as DocumentKey[];
    }

    return [
      'companyIncorporationCertificate',
      'companyPanCard',
      'companyAddressProof',
      ...(formData.companyGstApplicable ? (['companyGstCertificate'] as DocumentKey[]) : []),
      'companyBoardResolution'
    ] as DocumentKey[];
  }, [formData.category, formData.companyGstApplicable]);

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

  const validateStepOne = () => {
    if (!formData.entityName || !formData.contactNumber || !formData.email) {
      setError('Please fill name, contact number, and email.');
      return false;
    }

    if (formData.category === 'individual') {
      if (!user?.email_verified) {
        setError('Email verification is mandatory for individual verification. Please verify your email first.');
        return false;
      }
      return true;
    }

    if (formData.category === 'ngo') {
      if (
        !formData.panNumber ||
        !formData.registrationNumber ||
        !formData.ngoFcraRegistrationNumber ||
        !formData.ngoFcraExpiryDate ||
        !formData.ngoAssociationNumber
      ) {
        setError('Please fill all NGO manual fields including FCRA registration number, expiry date, and association number.');
        return false;
      }
      return true;
    }

    if (!formData.panNumber || !formData.registrationNumber) {
      setError('Please fill company registration number and PAN number.');
      return false;
    }

    return true;
  };

  const validateStepTwo = () => {
    const missing = requiredDocs.find((key) => !documentFiles[key]);
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
        action: 'initiate',
        documents: submittedDocuments,
      };
      if (user.user_type === 'ngo') {
        initiatePayload.organizationName = formData.entityName;
        initiatePayload.registrationNumber = formData.registrationNumber;
        initiatePayload.registrationType = formData.ngoRegistrationType;
      } else if (user.user_type === 'company') {
        initiatePayload.companyName = formData.entityName;
        initiatePayload.cinNumber = formData.companyCinNumber || formData.registrationNumber;
        initiatePayload.companyType = 'Registered Company';
      } else {
        initiatePayload.documentType = formData.individualIdType === 'pan' ? 'pan' : 'aadhaar';
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

      setSuccess('Verification details submitted successfully. Documents uploaded as per your verification type.');
    } catch (submissionError: any) {
      setError(submissionError?.message || 'Failed to submit verification details. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          onClick={handleBack}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Shield className="h-8 w-8 text-udaan-orange" />
        <div>
          <h1 className="text-3xl font-bold">Verification</h1>
          <p className="text-gray-600">Complete both pages to submit your verification request.</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <Badge variant={currentStep === 1 ? 'default' : 'outline'}>Page 1: Add Details</Badge>
            <Badge variant={currentStep === 2 ? 'default' : 'outline'}>Page 2: Upload Documents</Badge>
          </div>
          <p className="text-sm text-gray-600 mt-3 capitalize">
            Verification type: <span className="font-medium">{formData.category}</span>
          </p>
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
              <User className="h-5 w-5" />
              Add Details
            </CardTitle>
            <CardDescription>
              Fill all required details for your verification type.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="entityName">Name (Person / Company / NGO)</Label>
                <Input
                  id="entityName"
                  value={formData.entityName}
                  onChange={(e) => setFormData((prev) => ({ ...prev, entityName: e.target.value }))}
                  placeholder="Enter name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactNumber">Contact Number</Label>
                <Input
                  id="contactNumber"
                  value={formData.contactNumber}
                  onChange={(e) => setFormData((prev) => ({ ...prev, contactNumber: e.target.value }))}
                  placeholder="Enter contact number"
                />
              </div>
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

            {formData.category === 'individual' && (
              <>
                <div className="rounded-md border p-3 bg-gray-50 text-sm text-gray-700 space-y-1">
                  <p>
                    Email verification: <span className="font-medium">{user?.email_verified ? 'Verified' : 'Not Verified (mandatory)'}</span>
                  </p>
                  <p>
                    Phone OTP verification: <span className="font-medium">{user?.phone_verified ? 'Verified' : 'Not Verified (optional / recommended)'}</span>
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Optional ID Type (for high-trust roles)</Label>
                  <Select
                    value={formData.individualIdType}
                    onValueChange={(value) =>
                      setFormData((prev) => ({ ...prev, individualIdType: value as IndividualIdType }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select optional ID type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="aadhaar">Aadhaar</SelectItem>
                      <SelectItem value="pan">PAN</SelectItem>
                      <SelectItem value="voter-id">Voter ID</SelectItem>
                      <SelectItem value="driving-license">Driving License</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {formData.category === 'ngo' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Registration Type</Label>
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
                    <Label htmlFor="ngoRegistrationNumber">Registration Certificate Number</Label>
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
                    <Label htmlFor="ngoPanNumber">PAN Number</Label>
                    <Input
                      id="ngoPanNumber"
                      value={formData.panNumber}
                      maxLength={10}
                      onChange={(e) => setFormData((prev) => ({ ...prev, panNumber: e.target.value.toUpperCase() }))}
                      placeholder="ABCDE1234F"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ngoFcraRegistrationNumber">FCRA Registration Number</Label>
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
                    <Label htmlFor="ngoFcraExpiryDate">FCRA Expiry Date</Label>
                    <Input
                      id="ngoFcraExpiryDate"
                      type="date"
                      value={formData.ngoFcraExpiryDate}
                      onChange={(e) => setFormData((prev) => ({ ...prev, ngoFcraExpiryDate: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ngoAssociationNumber">Association Number</Label>
                    <Input
                      id="ngoAssociationNumber"
                      value={formData.ngoAssociationNumber}
                      onChange={(e) => setFormData((prev) => ({ ...prev, ngoAssociationNumber: e.target.value }))}
                      placeholder="Enter association number"
                    />
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
                    <Label htmlFor="companyCinNumber">CIN Number (Optional / Advanced)</Label>
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
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload Documents
            </CardTitle>
            <CardDescription>
              Upload required documents based on your verification type.
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
              <Button variant="outline" onClick={() => setCurrentStep(1)} disabled={loading}>
                Back to Details
              </Button>
              <Button onClick={submitVerification} disabled={loading}>
                {loading ? 'Submitting...' : 'Submit Verification'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
