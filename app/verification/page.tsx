'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Shield, 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  FileText, 
  Building, 
  User,
  ExternalLink,
  ArrowLeft
} from 'lucide-react';

interface VerificationStatus {
  verified: boolean;
  status: 'unverified' | 'pending' | 'verified' | 'rejected';
  verifiedAt?: string;
  level?: 'basic' | 'intermediate' | 'advanced';
}

interface IndividualVerification extends VerificationStatus {
  aadhaarVerified: boolean;
  panVerified: boolean;
}

interface NGOVerification extends VerificationStatus {
  gstVerified: boolean;
  panVerified: boolean;
  organizationName?: string;
  registrationNumber?: string;
  registrationType?: string;
}

interface CompanyVerification extends VerificationStatus {
  gstVerified: boolean;
  panVerified: boolean;
  companyName?: string;
  cinNumber?: string;
  companyType?: string;
}

export default function VerificationDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [verificationData, setVerificationData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form states for different user types
  const [individualForm, setIndividualForm] = useState({
    aadhaarNumber: '',
    panNumber: ''
  });

  const [ngoForm, setNgoForm] = useState({
    organizationName: '',
    gstNumber: '',
    panNumber: '',
    registrationNumber: '',
    registrationType: 'Trust'
  });

  const [companyForm, setCompanyForm] = useState({
    companyName: '',
    gstNumber: '',
    panNumber: '',
    cinNumber: '',
    companyType: 'Private Limited'
  });

  useEffect(() => {
    if (user) {
      fetchVerificationStatus();
    }
  }, [user]);

  const fetchVerificationStatus = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/verification/${user?.user_type}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setVerificationData(data);
      } else {
        setError('Failed to fetch verification status');
      }
    } catch (err) {
      setError('An error occurred while fetching verification status');
    } finally {
      setLoading(false);
    }
  };

  const initiateVerification = async () => {
    try {
      setSubmitting(true);
      setError(null);
      const token = localStorage.getItem('token');

      let payload: any = { action: 'initiate' };

      if (user?.user_type === 'individual') {
        // Individual verification doesn't need additional data for initiation
      } else if (user?.user_type === 'ngo') {
        payload = {
          ...payload,
          organizationName: ngoForm.organizationName,
          registrationNumber: ngoForm.registrationNumber,
          registrationType: ngoForm.registrationType
        };
      } else if (user?.user_type === 'company') {
        payload = {
          ...payload,
          companyName: companyForm.companyName,
          cinNumber: companyForm.cinNumber,
          companyType: companyForm.companyType
        };
      }

      const response = await fetch(`/api/verification/${user?.user_type}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok) {
        if (data.authUrl) {
          // Open verification URL in new window
          window.open(data.authUrl, '_blank');
          setSuccess('Please complete verification in the opened window');
        } else {
          setSuccess(data.message);
        }
        setTimeout(fetchVerificationStatus, 2000);
      } else {
        setError(data.error || 'Verification initiation failed');
      }
    } catch (err) {
      setError('An error occurred during verification initiation');
    } finally {
      setSubmitting(false);
    }
  };

  const verifyDocument = async (documentType: string, documentNumber: string) => {
    try {
      setSubmitting(true);
      setError(null);
      const token = localStorage.getItem('token');

      const payload = {
        action: `verify-${documentType}`,
        [`${documentType}Number`]: documentNumber
      };

      const response = await fetch(`/api/verification/${user?.user_type}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(data.message);
        setTimeout(fetchVerificationStatus, 1000);
      } else {
        setError(data.error || 'Document verification failed');
      }
    } catch (err) {
      setError('An error occurred during document verification');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'verified':
        return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Verified</Badge>;
      case 'pending':
        return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case 'rejected':
        return <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="secondary">Unverified</Badge>;
    }
  };

  const handleBack = () => {
    // Navigate back to appropriate dashboard based on user type
    if (user?.user_type === 'individual') {
      router.push('/individuals/dashboard#top');
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
    } else if (user?.user_type === 'ngo') {
      router.push('/ngos/dashboard#top');
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
    } else if (user?.user_type === 'company') {
      router.push('/companies/dashboard#top');
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
    } else {
      router.back(); // Fallback to browser back
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Back Button */}
      <div className="flex items-center gap-2 mb-4">
        <Button
          variant="ghost"
          onClick={handleBack}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Button>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <Shield className="h-8 w-8 text-udaan-orange" />
        <div>
          <h1 className="text-3xl font-bold">Verification Dashboard</h1>
          <p className="text-gray-600">Verify your identity, phone, and email to access all platform features including placing orders, messaging, and more.</p>
          {verificationData?.status !== 'verified' && (
            <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md text-yellow-800">
              <strong>Why verify?</strong> Verification helps keep the platform safe and unlocks all features. Please complete verification using DigiLocker, Aadhaar, PAN, and phone OTP.
            </div>
          )}
        </div>
      </div>

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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Verification Status
          </CardTitle>
          <CardDescription>
            Current verification level: {verificationData?.level || 'Basic'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="text-lg font-medium">Overall Status:</div>
            {getStatusBadge(verificationData?.status || 'unverified')}
            {verificationData?.verifiedAt && (
              <div className="text-sm text-gray-500">
                Verified on {new Date(verificationData.verifiedAt).toLocaleDateString()}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="documents" className="w-full">
        <TabsList>
          <TabsTrigger value="documents">Document Verification</TabsTrigger>
          <TabsTrigger value="status">Verification Details</TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="space-y-6">
          {user?.user_type === 'individual' && (
            <IndividualVerificationForm
              verificationData={verificationData}
              form={individualForm}
              setForm={setIndividualForm}
              onVerifyDocument={verifyDocument}
              onInitiate={initiateVerification}
              submitting={submitting}
            />
          )}

          {user?.user_type === 'ngo' && (
            <NGOVerificationForm
              verificationData={verificationData}
              form={ngoForm}
              setForm={setNgoForm}
              onVerifyDocument={verifyDocument}
              onInitiate={initiateVerification}
              submitting={submitting}
            />
          )}

          {user?.user_type === 'company' && (
            <CompanyVerificationForm
              verificationData={verificationData}
              form={companyForm}
              setForm={setCompanyForm}
              onVerifyDocument={verifyDocument}
              onInitiate={initiateVerification}
              submitting={submitting}
            />
          )}
        </TabsContent>

        <TabsContent value="status">
          <VerificationStatusDetails verificationData={verificationData} userType={user?.user_type} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Individual verification form component
function IndividualVerificationForm({ verificationData, form, setForm, onVerifyDocument, onInitiate, submitting }: any) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Aadhaar Verification</CardTitle>
          <CardDescription>Verify your identity using Aadhaar card</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>Status: {verificationData?.aadhaarVerified ? 
              <Badge className="bg-green-500">Verified</Badge> : 
              <Badge variant="outline">Not Verified</Badge>
            }</div>
            {!verificationData?.aadhaarVerified && (
              <Button onClick={onInitiate} disabled={submitting}>
                <ExternalLink className="w-4 h-4 mr-2" />
                Verify with DigiLocker
              </Button>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="aadhaar">Aadhaar Number (Alternative)</Label>
            <div className="flex gap-2">
              <Input
                id="aadhaar"
                placeholder="XXXX XXXX XXXX"
                value={form.aadhaarNumber}
                onChange={(e) => setForm({...form, aadhaarNumber: e.target.value})}
                maxLength={12}
              />
              <Button
                variant="outline"
                onClick={() => onVerifyDocument('aadhaar', form.aadhaarNumber)}
                disabled={submitting || !form.aadhaarNumber}
              >
                Verify
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>PAN Verification</CardTitle>
          <CardDescription>Verify your PAN card</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>Status: {verificationData?.panVerified ? 
              <Badge className="bg-green-500">Verified</Badge> : 
              <Badge variant="outline">Not Verified</Badge>
            }</div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="pan">PAN Number</Label>
            <div className="flex gap-2">
              <Input
                id="pan"
                placeholder="ABCDE1234F"
                value={form.panNumber}
                onChange={(e) => setForm({...form, panNumber: e.target.value.toUpperCase()})}
                maxLength={10}
              />
              <Button
                variant="outline"
                onClick={() => onVerifyDocument('pan', form.panNumber)}
                disabled={submitting || !form.panNumber}
              >
                Verify
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// NGO verification form component
function NGOVerificationForm({ verificationData, form, setForm, onVerifyDocument, onInitiate, submitting }: any) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Organization Details</CardTitle>
          <CardDescription>Provide your NGO registration details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="orgName">Organization Name</Label>
              <Input
                id="orgName"
                value={form.organizationName}
                onChange={(e) => setForm({...form, organizationName: e.target.value})}
                placeholder="Enter organization name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="regNumber">Registration Number</Label>
              <Input
                id="regNumber"
                value={form.registrationNumber}
                onChange={(e) => setForm({...form, registrationNumber: e.target.value})}
                placeholder="Enter registration number"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="regType">Registration Type</Label>
            <Select value={form.registrationType} onValueChange={(value) => setForm({...form, registrationType: value})}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Trust">Trust</SelectItem>
                <SelectItem value="Society">Society</SelectItem>
                <SelectItem value="Section8">Section 8 Company</SelectItem>
                <SelectItem value="12A">12A Registration</SelectItem>
                <SelectItem value="80G">80G Registration</SelectItem>
                <SelectItem value="FCRA">FCRA Registration</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button onClick={onInitiate} disabled={submitting}>
            <ExternalLink className="w-4 h-4 mr-2" />
            Start Verification with EntityLocker
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>GST Verification</CardTitle>
            <CardDescription>Verify your GST registration</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>Status: {verificationData?.gstVerified ? 
              <Badge className="bg-green-500">Verified</Badge> : 
              <Badge variant="outline">Not Verified</Badge>
            }</div>
            
            <div className="space-y-2">
              <Label htmlFor="gst">GST Number</Label>
              <div className="flex gap-2">
                <Input
                  id="gst"
                  placeholder="22AAAAA0000A1Z5"
                  value={form.gstNumber}
                  onChange={(e) => setForm({...form, gstNumber: e.target.value.toUpperCase()})}
                  maxLength={15}
                />
                <Button
                  variant="outline"
                  onClick={() => onVerifyDocument('gst', form.gstNumber)}
                  disabled={submitting || !form.gstNumber}
                >
                  Verify
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>PAN Verification</CardTitle>
            <CardDescription>Verify your organization's PAN</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>Status: {verificationData?.panVerified ? 
              <Badge className="bg-green-500">Verified</Badge> : 
              <Badge variant="outline">Not Verified</Badge>
            }</div>
            
            <div className="space-y-2">
              <Label htmlFor="pan">PAN Number</Label>
              <div className="flex gap-2">
                <Input
                  id="pan"
                  placeholder="ABCDE1234F"
                  value={form.panNumber}
                  onChange={(e) => setForm({...form, panNumber: e.target.value.toUpperCase()})}
                  maxLength={10}
                />
                <Button
                  variant="outline"
                  onClick={() => onVerifyDocument('pan', form.panNumber)}
                  disabled={submitting || !form.panNumber}
                >
                  Verify
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Company verification form component
function CompanyVerificationForm({ verificationData, form, setForm, onVerifyDocument, onInitiate, submitting }: any) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Company Details</CardTitle>
          <CardDescription>Provide your company registration details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name</Label>
              <Input
                id="companyName"
                value={form.companyName}
                onChange={(e) => setForm({...form, companyName: e.target.value})}
                placeholder="Enter company name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cin">CIN Number</Label>
              <Input
                id="cin"
                value={form.cinNumber}
                onChange={(e) => setForm({...form, cinNumber: e.target.value.toUpperCase()})}
                placeholder="L99999MH2020PTC123456"
                maxLength={21}
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="companyType">Company Type</Label>
            <Select value={form.companyType} onValueChange={(value) => setForm({...form, companyType: value})}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Private Limited">Private Limited</SelectItem>
                <SelectItem value="Public Limited">Public Limited</SelectItem>
                <SelectItem value="LLP">Limited Liability Partnership</SelectItem>
                <SelectItem value="Partnership">Partnership</SelectItem>
                <SelectItem value="Proprietorship">Proprietorship</SelectItem>
                <SelectItem value="OPC">One Person Company</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button onClick={onInitiate} disabled={submitting}>
            <ExternalLink className="w-4 h-4 mr-2" />
            Start Verification with EntityLocker
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>GST Verification</CardTitle>
            <CardDescription>Verify your company's GST registration</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>Status: {verificationData?.gstVerified ? 
              <Badge className="bg-green-500">Verified</Badge> : 
              <Badge variant="outline">Not Verified</Badge>
            }</div>
            
            <div className="space-y-2">
              <Label htmlFor="gst">GST Number</Label>
              <div className="flex gap-2">
                <Input
                  id="gst"
                  placeholder="22AAAAA0000A1Z5"
                  value={form.gstNumber}
                  onChange={(e) => setForm({...form, gstNumber: e.target.value.toUpperCase()})}
                  maxLength={15}
                />
                <Button
                  variant="outline"
                  onClick={() => onVerifyDocument('gst', form.gstNumber)}
                  disabled={submitting || !form.gstNumber}
                >
                  Verify
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>PAN Verification</CardTitle>
            <CardDescription>Verify your company's PAN</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>Status: {verificationData?.panVerified ? 
              <Badge className="bg-green-500">Verified</Badge> : 
              <Badge variant="outline">Not Verified</Badge>
            }</div>
            
            <div className="space-y-2">
              <Label htmlFor="pan">PAN Number</Label>
              <div className="flex gap-2">
                <Input
                  id="pan"
                  placeholder="ABCDE1234F"
                  value={form.panNumber}
                  onChange={(e) => setForm({...form, panNumber: e.target.value.toUpperCase()})}
                  maxLength={10}
                />
                <Button
                  variant="outline"
                  onClick={() => onVerifyDocument('pan', form.panNumber)}
                  disabled={submitting || !form.panNumber}
                >
                  Verify
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Verification status details component
function VerificationStatusDetails({ verificationData, userType }: any) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Verification Details
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <h4 className="font-medium">Account Type</h4>
              <p className="text-sm text-gray-600 capitalize">{userType}</p>
            </div>
            <div>
              <h4 className="font-medium">Verification Level</h4>
              <p className="text-sm text-gray-600 capitalize">{verificationData?.level || 'Basic'}</p>
            </div>
            <div>
              <h4 className="font-medium">Status</h4>
              <p className="text-sm text-gray-600 capitalize">{verificationData?.status || 'Unverified'}</p>
            </div>
          </div>

          {verificationData?.verifiedAt && (
            <div>
              <h4 className="font-medium">Verified Date</h4>
              <p className="text-sm text-gray-600">
                {new Date(verificationData.verifiedAt).toLocaleDateString('en-IN', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            </div>
          )}

          {userType === 'individual' && (
            <div className="space-y-2">
              <h4 className="font-medium">Document Status</h4>
              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm">Aadhaar:</span>
                  {verificationData?.aadhaarVerified ? 
                    <CheckCircle className="h-4 w-4 text-green-500" /> : 
                    <Clock className="h-4 w-4 text-gray-400" />
                  }
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm">PAN:</span>
                  {verificationData?.panVerified ? 
                    <CheckCircle className="h-4 w-4 text-green-500" /> : 
                    <Clock className="h-4 w-4 text-gray-400" />
                  }
                </div>
              </div>
            </div>
          )}

          {(userType === 'ngo' || userType === 'company') && (
            <div className="space-y-2">
              <h4 className="font-medium">Document Status</h4>
              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm">GST:</span>
                  {verificationData?.gstVerified ? 
                    <CheckCircle className="h-4 w-4 text-green-500" /> : 
                    <Clock className="h-4 w-4 text-gray-400" />
                  }
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm">PAN:</span>
                  {verificationData?.panVerified ? 
                    <CheckCircle className="h-4 w-4 text-green-500" /> : 
                    <Clock className="h-4 w-4 text-gray-400" />
                  }
                </div>
              </div>
            </div>
          )}

          {userType === 'ngo' && verificationData?.organizationName && (
            <div>
              <h4 className="font-medium">Organization Details</h4>
              <div className="text-sm text-gray-600 space-y-1">
                <p>Name: {verificationData.organizationName}</p>
                {verificationData.registrationNumber && (
                  <p>Registration: {verificationData.registrationNumber}</p>
                )}
                {verificationData.registrationType && (
                  <p>Type: {verificationData.registrationType}</p>
                )}
              </div>
            </div>
          )}

          {userType === 'company' && verificationData?.companyName && (
            <div>
              <h4 className="font-medium">Company Details</h4>
              <div className="text-sm text-gray-600 space-y-1">
                <p>Name: {verificationData.companyName}</p>
                {verificationData.cinNumber && (
                  <p>CIN: {verificationData.cinNumber}</p>
                )}
                {verificationData.companyType && (
                  <p>Type: {verificationData.companyType}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}