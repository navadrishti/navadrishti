'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  ArrowLeft,
  FileText, 
  CheckCircle2, 
  XCircle, 
  MessageSquare,
  Download,
  Check,
  X,
  Loader2
} from 'lucide-react';
import Link from 'next/link';
import type { VerificationCase, VerificationDocument, OCRResult, VerificationStatus } from '@/lib/types/verification';

export default function CACaseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const caseId = params.id as string;

  const [caseData, setCaseData] = useState<VerificationCase | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<VerificationDocument | null>(null);
  const [ocrResults, setOcrResults] = useState<Record<string, OCRResult>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const [caNotes, setCaNotes] = useState('');
  const [udinNumber, setUdinNumber] = useState('');
  const [validityMonths, setValidityMonths] = useState('12');
  const [rejectionReasonText, setRejectionReason] = useState('');
  const [clarificationMessage, setClarificationMessage] = useState('');

  useEffect(() => {
    fetchCaseDetails();
  }, [caseId]);

  const fetchCaseDetails = async () => {
    try {
      setLoading(true);
      
      // TODO: Replace with actual API call
      // const response = await fetch(`/api/ca/cases/${caseId}`, {
      //   headers: { Authorization: `Bearer ${localStorage.getItem('ca_token')}` }
      // });
      // const data = await response.json();
      
      // Mock data
      setTimeout(() => {
        // Determine status based on case ID
        // History cases: VC-2026-006 through VC-2026-011 (completed)
        // Dashboard cases: VC-2026-001 through VC-2026-005 (pending)
        let status: VerificationStatus = 'assigned_to_ca';
        let entityName = 'Green Earth Foundation';
        let entityType: 'ngo' | 'company' = 'ngo';
        
        if (caseId === 'VC-2026-001') {
          status = 'assigned_to_ca';
          entityName = 'Green Earth Foundation';
        } else if (caseId === 'VC-2026-002') {
          status = 'under_ca_review';
          entityName = 'Tech Solutions Pvt Ltd';
          entityType = 'company';
        } else if (caseId === 'VC-2026-003') {
          status = 'assigned_to_ca';
          entityName = 'Hope for Children Trust';
        } else if (caseId === 'VC-2026-004') {
          status = 'clarification_needed';
          entityName = 'Education For All Society';
        } else if (caseId === 'VC-2026-005') {
          status = 'assigned_to_ca';
          entityName = 'InnovateCorp India Ltd';
          entityType = 'company';
        } else if (caseId === 'VC-2026-006') {
          status = 'ca_approved';
          entityName = 'Rural Health Initiative';
        } else if (caseId === 'VC-2026-007') {
          status = 'ca_approved';
          entityName = 'Clean Water Foundation';
        } else if (caseId === 'VC-2026-008') {
          status = 'ca_rejected';
          entityName = 'Digital Services Ltd';
          entityType = 'company';
        } else if (caseId === 'VC-2026-009') {
          status = 'ca_approved';
          entityName = 'Women Empowerment Trust';
        } else if (caseId === 'VC-2026-010') {
          status = 'ca_approved';
          entityName = 'Global Consulting Group';
          entityType = 'company';
        } else if (caseId === 'VC-2026-011') {
          status = 'ca_rejected';
          entityName = 'Fake NGO Trust';
        }
        
        const mockCase: VerificationCase = {
          id: caseId,
          user_id: 123,
          entity_type: entityType,
          entity_name: entityName,
          registration_number: 'NGO/2023/12345',
          registration_type: 'Trust',
          pan_number: 'AAATG1234F',
          status: status,
          priority: 'urgent',
          submitted_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          assigned_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
          pre_check_passed: true,
          pre_check_issues: [],
          documents: [
            {
              id: 'doc-1',
              case_id: caseId,
              document_type: 'registration_certificate',
              file_url: 'https://via.placeholder.com/800x1000/0ea5e9/ffffff?text=Registration+Certificate',
              file_name: 'registration_cert.pdf',
              file_size: 524288,
              uploaded_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
              ocr_status: 'completed',
              ocr_result_id: 'ocr-1'
            },
            {
              id: 'doc-2',
              case_id: caseId,
              document_type: 'pan_card',
              file_url: 'https://via.placeholder.com/800x500/10b981/ffffff?text=PAN+Card',
              file_name: 'pan_card.pdf',
              file_size: 204800,
              uploaded_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
              ocr_status: 'completed',
              ocr_result_id: 'ocr-2'
            },
            {
              id: 'doc-3',
              case_id: caseId,
              document_type: 'fcra_certificate',
              file_url: 'https://via.placeholder.com/800x1000/8b5cf6/ffffff?text=FCRA+Certificate',
              file_name: 'fcra_cert.pdf',
              file_size: 614400,
              uploaded_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
              ocr_status: 'completed',
              ocr_result_id: 'ocr-3'
            },
            {
              id: 'doc-4',
              case_id: caseId,
              document_type: 'address_proof',
              file_url: 'https://via.placeholder.com/800x600/f59e0b/ffffff?text=Address+Proof',
              file_name: 'utility_bill.pdf',
              file_size: 153600,
              uploaded_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
              ocr_status: 'completed',
              ocr_result_id: 'ocr-4'
            }
          ],
          created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          updated_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()
        };

        const mockOcrResults: Record<string, OCRResult> = {
          'ocr-1': {
            id: 'ocr-1',
            document_id: 'doc-1',
            extracted_text: 'CERTIFICATE OF REGISTRATION\n\nThis is to certify that Green Earth Foundation has been registered as a Trust under the Indian Trusts Act, 1882...',
            structured_data: {
              entity_name: 'Green Earth Foundation',
              registration_number: 'NGO/2023/12345',
              registration_date: '2023-01-15',
              address: '123 Green Street, Mumbai, Maharashtra'
            },
            validation_flags: {
              format_valid: true,
              expiry_valid: true,
              name_match: true,
              number_match: true,
              issues: []
            },
            confidence_score: 0.96,
            processed_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
          },
          'ocr-2': {
            id: 'ocr-2',
            document_id: 'doc-2',
            extracted_text: 'Permanent Account Number Card\n\nName: GREEN EARTH FOUNDATION\nPAN: AAATG1234F\n...',
            structured_data: {
              entity_name: 'GREEN EARTH FOUNDATION',
              pan_number: 'AAATG1234F'
            },
            validation_flags: {
              format_valid: true,
              expiry_valid: true,
              name_match: true,
              number_match: true,
              issues: []
            },
            confidence_score: 0.98,
            processed_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
          },
          'ocr-3': {
            id: 'ocr-3',
            document_id: 'doc-3',
            extracted_text: 'FCRA REGISTRATION CERTIFICATE\n\nRegistration Number: 083781425\nValidity: 2028-12-31\n...',
            structured_data: {
              fcra_number: '083781425',
              fcra_validity: '2028-12-31',
              entity_name: 'Green Earth Foundation'
            },
            validation_flags: {
              format_valid: true,
              expiry_valid: true,
              name_match: true,
              number_match: false,
              issues: ['FCRA number format needs manual verification']
            },
            confidence_score: 0.89,
            processed_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
          },
          'ocr-4': {
            id: 'ocr-4',
            document_id: 'doc-4',
            extracted_text: 'Electricity Bill\n\nAccount Name: Green Earth Foundation\nAddress: 123 Green Street, Mumbai...',
            structured_data: {
              address: '123 Green Street, Mumbai, Maharashtra',
              city: 'Mumbai',
              state: 'Maharashtra',
              pincode: '400001'
            },
            validation_flags: {
              format_valid: true,
              expiry_valid: true,
              name_match: true,
              number_match: true,
              issues: []
            },
            confidence_score: 0.92,
            processed_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
          }
        };

        setCaseData(mockCase);
        setOcrResults(mockOcrResults);
        if (mockCase.documents.length > 0) {
          setSelectedDocument(mockCase.documents[0]);
        }
        setLoading(false);
      }, 500);
      
    } catch (error) {
      console.error('Failed to fetch case details:', error);
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!udinNumber || !caNotes) {
      alert('Please enter UDIN number and CA notes');
      return;
    }

    if (confirm('Are you sure you want to approve this verification?')) {
      setSubmitting(true);
      
      // TODO: Replace with actual API call
      // await fetch(`/api/ca/cases/${caseId}/approve`, {
      //   method: 'POST',
      //   headers: { 
      //     'Content-Type': 'application/json',
      //     Authorization: `Bearer ${localStorage.getItem('ca_token')}`
      //   },
      //   body: JSON.stringify({ udin_number: udinNumber, ca_notes: caNotes, validity_months: parseInt(validityMonths) })
      // });

      setTimeout(() => {
        alert(' Case approved successfully!');
        router.push('/ca');
      }, 1000);
    }
  };

  const handleReject = async () => {
    if (!rejectionReasonText) {
      alert('Please enter rejection reason');
      return;
    }

    if (confirm('Are you sure you want to reject this verification?')) {
      setSubmitting(true);
      
      // TODO: Replace with actual API call
      setTimeout(() => {
        alert('Case rejected');
        router.push('/ca');
      }, 1000);
    }
  };

  const handleRequestClarification = async () => {
    if (!clarificationMessage) {
      alert('Please enter clarification message');
      return;
    }

    setSubmitting(true);
    
    // TODO: Replace with actual API call
    setTimeout(() => {
      alert('Clarification request sent to applicant');
      setClarificationMessage('');
      setSubmitting(false);
    }, 1000);
  };

  const getDocumentTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      registration_certificate: 'Registration Certificate',
      pan_card: 'PAN Card',
      fcra_certificate: 'FCRA Certificate',
      trust_deed: 'Trust Deed',
      moa: 'Memorandum of Association',
      address_proof: 'Address Proof',
      audit_report: 'Audit Report',
      gst_certificate: 'GST Certificate'
    };
    return labels[type] || type;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto"></div>
          <p className="mt-4 text-blue-600">Loading case details...</p>
        </div>
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="text-center py-12">
        <p className="text-blue-600">Case not found</p>
        <Link href="/ca">
          <Button className="mt-4 bg-orange-500 hover:bg-orange-600">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  const currentOcr = selectedDocument && ocrResults[selectedDocument.ocr_result_id!];

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Link href={caseData.status === 'ca_approved' || caseData.status === 'ca_rejected' ? '/ca/cases' : '/ca'}>
        <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to {caseData.status === 'ca_approved' || caseData.status === 'ca_rejected' ? 'History' : 'Dashboard'}
        </Button>
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-4">
          <div>
            <h1 className="text-3xl font-bold text-blue-900">{caseData.entity_name}</h1>
            <p className="text-blue-700 mt-1">Case #{caseData.id}</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <Badge variant="outline" className="text-sm py-1">
            {caseData.entity_type.toUpperCase()}
          </Badge>
          {caseData.status === 'ca_approved' && (
            <Badge className="bg-green-100 text-green-800">
              Verified
            </Badge>
          )}
          {caseData.status === 'ca_rejected' && (
            <Badge className="bg-orange-100 text-orange-800">
              Rejected
            </Badge>
          )}
          {caseData.priority === 'urgent' && (caseData.status === 'assigned_to_ca' || caseData.status === 'under_ca_review' || caseData.status === 'clarification_needed') && (
            <Badge className="bg-red-100 text-red-800">
              Urgent
            </Badge>
          )}
        </div>
      </div>

      {/* Case Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-white border-blue-200">
          <CardContent className="pt-6">
            <div className="text-sm text-blue-600 mb-1">Registration Number</div>
            <div className="font-semibold text-blue-900">{caseData.registration_number}</div>
          </CardContent>
        </Card>
        <Card className="bg-white border-blue-200">
          <CardContent className="pt-6">
            <div className="text-sm text-blue-600 mb-1">PAN Number</div>
            <div className="font-semibold text-blue-900">{caseData.pan_number}</div>
          </CardContent>
        </Card>
        <Card className="bg-white border-blue-200">
          <CardContent className="pt-6">
            <div className="text-sm text-blue-600 mb-1">Registration Type</div>
            <div className="font-semibold text-blue-900">{caseData.registration_type}</div>
          </CardContent>
        </Card>
      </div>

      {/* Pre-check Status */}
      {caseData.pre_check_passed && (
        <Alert className="bg-green-50 border-green-200">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            Automated pre-checks passed. All documents are valid and cross-document verification successful.
          </AlertDescription>
        </Alert>
      )}

      {/* Main Content - Documents & Review */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Documents List */}
        <div className="lg:col-span-1">
          <Card className="bg-white border-blue-200">
            <CardHeader>
              <CardTitle className="text-blue-900">Documents ({caseData.documents.length})</CardTitle>
              <CardDescription className="text-blue-600">Click to view and review OCR results</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {caseData.documents.map((doc) => {
                const ocr = ocrResults[doc.ocr_result_id!];
                const hasIssues = ocr && ocr.validation_flags.issues.length > 0;
                
                return (
                  <button
                    key={doc.id}
                    onClick={() => setSelectedDocument(doc)}
                    className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                      selectedDocument?.id === doc.id
                        ? 'border-orange-500 bg-orange-50'
                        : 'border-blue-200 hover:border-blue-400 bg-blue-50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <FileText className="h-4 w-4 text-blue-600" />
                          <span className="text-sm font-medium text-blue-900">
                            {getDocumentTypeLabel(doc.document_type)}
                          </span>
                        </div>
                        <div className="text-xs text-blue-500 mt-1">{doc.file_name}</div>
                        {ocr && (
                          <div className="flex items-center mt-2">
                            {hasIssues ? (
                              <Badge className="bg-orange-100 text-orange-800 text-xs">
                                Needs Review
                              </Badge>
                            ) : (
                              <Badge className="bg-green-100 text-green-800 text-xs">
                                Verified
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Document Viewer & OCR Results */}
        <div className="lg:col-span-2 space-y-6">
          {selectedDocument && (
            <>
              {/* Document Viewer */}
              <Card className="bg-white border-blue-200">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-blue-900">{getDocumentTypeLabel(selectedDocument.document_type)}</CardTitle>
                    <Button variant="outline" size="sm" className="border-blue-500 text-blue-600 hover:bg-blue-50">
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="border rounded-lg overflow-hidden bg-gray-100">
                    <img 
                      src={selectedDocument.file_url} 
                      alt={selectedDocument.file_name}
                      className="w-full h-auto"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* OCR Results */}
              {currentOcr && (
                <Card className="bg-white border-blue-200">
                  <CardHeader>
                    <CardTitle className="text-blue-900">OCR Extraction Results</CardTitle>
                    <CardDescription className="text-blue-600">
                      Confidence: {(currentOcr.confidence_score * 100).toFixed(1)}%
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Validation Status */}
                    <div className="space-y-2">
                      <Label>Validation Status</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex items-center space-x-2">
                          {currentOcr.validation_flags.format_valid ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <X className="h-4 w-4 text-red-600" />
                          )}
                          <span className="text-sm">Format Valid</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          {currentOcr.validation_flags.name_match ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <X className="h-4 w-4 text-red-600" />
                          )}
                          <span className="text-sm">Name Match</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          {currentOcr.validation_flags.expiry_valid ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <X className="h-4 w-4 text-red-600" />
                          )}
                          <span className="text-sm">Not Expired</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          {currentOcr.validation_flags.number_match ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <X className="h-4 w-4 text-red-600" />
                          )}
                          <span className="text-sm">Number Match</span>
                        </div>
                      </div>
                    </div>

                    {/* Issues */}
                    {currentOcr.validation_flags.issues.length > 0 && (
                      <Alert className="bg-orange-50 border-orange-200">
                        <AlertDescription className="text-orange-800">
                          <div className="font-semibold mb-1">Issues Found:</div>
                          <ul className="list-disc list-inside space-y-1">
                            {currentOcr.validation_flags.issues.map((issue, idx) => (
                              <li key={idx}>{issue}</li>
                            ))}
                          </ul>
                        </AlertDescription>
                      </Alert>
                    )}

                    {/* Extracted Data */}
                    <div className="space-y-2">
                      <Label>Extracted Data</Label>
                      <div className="bg-blue-50 rounded-lg p-4 space-y-2">
                        {Object.entries(currentOcr.structured_data).map(([key, value]) => (
                          <div key={key} className="grid grid-cols-2 gap-4">
                            <span className="text-sm font-medium text-blue-600 capitalize">
                              {key.replace(/_/g, ' ')}:
                            </span>
                            <span className="text-sm text-blue-900">{value as string}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Extracted Text */}
                    <div className="space-y-2">
                      <Label>Full Extracted Text</Label>
                      <Textarea 
                        value={currentOcr.extracted_text} 
                        readOnly 
                        rows={4}
                        className="font-mono text-xs"
                      />
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      {/* Action Section - Only show for pending cases */}
      {(caseData.status === 'assigned_to_ca' || 
        caseData.status === 'under_ca_review' || 
        caseData.status === 'clarification_needed') && (
        <Card className="border-2 border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle>CA Review & Decision</CardTitle>
            <CardDescription>Review all documents and provide your decision</CardDescription>
          </CardHeader>
        <CardContent>
          <Tabs defaultValue="approve" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="approve">
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Approve
              </TabsTrigger>
              <TabsTrigger value="reject">
                <XCircle className="h-4 w-4 mr-2" />
                Reject
              </TabsTrigger>
              <TabsTrigger value="clarify">
                <MessageSquare className="h-4 w-4 mr-2" />
                Request Clarification
              </TabsTrigger>
            </TabsList>

            {/* Approve Tab */}
            <TabsContent value="approve" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="udin">UDIN Number *</Label>
                <Input
                  id="udin"
                  placeholder="Enter ICAI UDIN number"
                  value={udinNumber}
                  onChange={(e) => setUdinNumber(e.target.value.toUpperCase())}
                  maxLength={18}
                />
                <p className="text-xs text-gray-500">
                  Example: 20240101ABCDE12345
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="validity">Validity Period</Label>
                <Select value={validityMonths} onValueChange={setValidityMonths}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6">6 Months</SelectItem>
                    <SelectItem value="12">12 Months</SelectItem>
                    <SelectItem value="24">24 Months</SelectItem>
                    <SelectItem value="36">36 Months</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ca-notes">CA Notes *</Label>
                <Textarea
                  id="ca-notes"
                  placeholder="Enter your verification notes and remarks"
                  value={caNotes}
                  onChange={(e) => setCaNotes(e.target.value)}
                  rows={4}
                />
              </div>

              <Button 
                onClick={handleApprove} 
                className="w-full bg-green-600 hover:bg-green-700 text-white"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Approve Verification
                  </>
                )}
              </Button>
            </TabsContent>

            {/* Reject Tab */}
            <TabsContent value="reject" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="rejection-reason">Rejection Reason *</Label>
                <Textarea
                  id="rejection-reason"
                  placeholder="Provide detailed reason for rejection"
                  value={rejectionReasonText}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  rows={6}
                />
              </div>

              <Button 
                onClick={handleReject} 
                variant="destructive" 
                className="w-full bg-orange-600 hover:bg-orange-700"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject Verification
                  </>
                )}
              </Button>
            </TabsContent>

            {/* Clarification Tab */}
            <TabsContent value="clarify" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="clarification">Clarification Message *</Label>
                <Textarea
                  id="clarification"
                  placeholder="Specify what additional information or documents are needed"
                  value={clarificationMessage}
                  onChange={(e) => setClarificationMessage(e.target.value)}
                  rows={6}
                />
              </div>

              <Button 
                onClick={handleRequestClarification} 
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Send Clarification Request
                  </>
                )}
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      )}

      {/* Completed Case Notice */}
      {(caseData.status === 'ca_approved' || caseData.status === 'ca_rejected') && (
        <Card className="border-2 border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <div className="text-center">
              {caseData.status === 'ca_approved' ? (
                <div className="text-green-600">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-3" />
                  <h3 className="text-xl font-semibold mb-2">Case Approved</h3>
                  <p className="text-gray-600">This case has been successfully verified and approved.</p>
                </div>
              ) : (
                <div className="text-orange-600">
                  <XCircle className="h-12 w-12 mx-auto mb-3" />
                  <h3 className="text-xl font-semibold mb-2">Case Rejected</h3>
                  <p className="text-gray-600">This case has been reviewed and rejected.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
