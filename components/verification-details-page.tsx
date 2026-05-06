'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, Check, X, FileText, AlertCircle } from 'lucide-react';
import Link from 'next/link';

interface VerificationDetail {
  id: number;
  user_id: number;
  [key: string]: any;
}

interface VerificationDetailsPageProps {
  type: 'individuals' | 'companies' | 'ngos';
}

export default function VerificationDetailsPage({ type }: VerificationDetailsPageProps) {
  const [items, setItems] = useState<VerificationDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<VerificationDetail | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejection_reason, setRejectionReason] = useState('');

  useEffect(() => {
    fetchItems();
  }, [type]);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/ca/${type}?status=unverified`);
      const data = await response.json();
      setItems(data.data || []);
    } catch (error) {
      console.error('Failed to fetch items:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (action: 'approve' | 'reject') => {
    if (!selectedItem) return;

    if (action === 'reject' && !rejection_reason.trim()) {
      alert('Please provide a reason for rejection');
      return;
    }

    setActionLoading(true);
    try {
      const response = await fetch('/api/ca/verification-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: type,
          entity_id: selectedItem.id,
          action: action === 'approve' ? 'approve' : 'reject',
          reason: rejection_reason
        })
      });

      if (response.ok) {
        alert(`${type.slice(0, -1)} ${action}d successfully`);
        setItems(items.filter(item => item.id !== selectedItem.id));
        setSelectedItem(null);
        setRejectionReason('');
      }
    } catch (error) {
      console.error('Action failed:', error);
      alert('Failed to process action');
    } finally {
      setActionLoading(false);
    }
  };

  const getDisplayName = () => {
    const names = {
      individuals: 'Individual Verifications',
      companies: 'Company Verifications',
      ngos: 'NGO Verifications'
    };
    return names[type];
  };

  const getListItemDisplay = (item: VerificationDetail) => {
    if (type === 'individuals') {
      return {
        title: item.name,
        subtitle: item.profession,
        badge: `${item.documents_verified}/${item.documents_total} docs`,
        email: item.email
      };
    } else if (type === 'companies') {
      return {
        title: item.company_name,
        subtitle: item.company_type,
        badge: `${item.documents_verified}/${item.documents_total} docs`,
        email: item.email
      };
    } else {
      return {
        title: item.ngo_name,
        subtitle: item.registration_type,
        badge: `${item.documents_verified}/${item.documents_total} docs`,
        email: item.email
      };
    }
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {selectedItem ? (
          // Detail View
          <DetailModalView
            item={selectedItem}
            type={type}
            onBack={() => {
              setSelectedItem(null);
              setRejectionReason('');
            }}
            onApprove={() => handleAction('approve')}
            onReject={() => handleAction('reject')}
            rejectionReason={rejection_reason}
            setRejectionReason={setRejectionReason}
            actionLoading={actionLoading}
          />
        ) : (
          // List View
          <>
            <div className="flex items-center gap-4 mb-6">
              <Link href="/ca">
                <Button variant="outline" size="sm">
                  <ChevronLeft className="w-4 h-4" />
                  Back to Dashboard
                </Button>
              </Link>
              <h1 className="text-3xl font-bold">{getDisplayName()}</h1>
              <Badge variant="secondary">{items.length} pending</Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((item) => {
                const display = getListItemDisplay(item);
                return (
                  <Card
                    key={item.id}
                    className="cursor-pointer hover:shadow-lg transition-shadow"
                    onClick={() => setSelectedItem(item)}
                  >
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg line-clamp-1">{display.title}</CardTitle>
                      <CardDescription className="line-clamp-1">{display.subtitle}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="text-sm text-gray-600 line-clamp-1">{display.email}</div>
                      <div className="flex items-center justify-between">
                        <Badge variant="outline">{display.badge}</Badge>
                        <span className="text-xs text-gray-500">Click to review</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {items.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center">
                  <AlertCircle className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                  <p className="text-gray-500">No pending verifications</p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface DetailModalViewProps {
  item: VerificationDetail;
  type: 'individuals' | 'companies' | 'ngos';
  onBack: () => void;
  onApprove: () => void;
  onReject: () => void;
  rejectionReason: string;
  setRejectionReason: (reason: string) => void;
  actionLoading: boolean;
}

function DetailModalView({
  item,
  type,
  onBack,
  onApprove,
  onReject,
  rejectionReason,
  setRejectionReason,
  actionLoading
}: DetailModalViewProps) {
  const [showRejectForm, setShowRejectForm] = useState(false);

  const getDetailSections = () => {
    if (type === 'individuals') {
      return [
        {
          title: 'Personal Information',
          fields: [
            { label: 'Name', value: item.name },
            { label: 'Email', value: item.email },
            { label: 'Phone', value: item.phone },
            { label: 'Profession', value: item.profession }
          ]
        },
        {
          title: 'Verification Documents',
          fields: [
            { label: 'Aadhaar', value: item.aadhaar },
            { label: 'PAN', value: item.pan },
            { label: 'Experience', value: `${item.experience_years} years` }
          ]
        },
        {
          title: 'Skills & Qualifications',
          fields: [
            { label: 'Skills', value: item.skills?.join(', ') },
            { label: 'Certificates', value: item.certificates?.join(', ') }
          ]
        },
        {
          title: 'Documents',
          fields: [
            { label: 'Documents', value: item.kyc_documents?.join(', ') }
          ]
        }
      ];
    } else if (type === 'companies') {
      return [
        {
          title: 'Company Information',
          fields: [
            { label: 'Company Name', value: item.company_name },
            { label: 'Email', value: item.email },
            { label: 'Phone', value: item.phone },
            { label: 'Type', value: item.company_type }
          ]
        },
        {
          title: 'Registration Details',
          fields: [
            { label: 'GST', value: item.gst },
            { label: 'PAN', value: item.pan },
            { label: 'CIN', value: item.cin },
            { label: 'Registration Number', value: item.registration_number }
          ]
        },
        {
          title: 'Business Details',
          fields: [
            { label: 'Description', value: item.business_description },
            { label: 'Address', value: item.registered_address }
          ]
        },
        {
          title: 'Documents',
          fields: [
            { label: 'Documents', value: item.registration_documents?.join(', ') }
          ]
        }
      ];
    } else {
      return [
        {
          title: 'NGO Information',
          fields: [
            { label: 'NGO Name', value: item.ngo_name },
            { label: 'Email', value: item.email },
            { label: 'Phone', value: item.phone },
            { label: 'Registration Type', value: item.registration_type }
          ]
        },
        {
          title: 'Registration Details',
          fields: [
            { label: 'Registration Number', value: item.registration_number },
            { label: 'Registration Date', value: item.trust_registration_date },
            { label: 'FCRA Number', value: item.fcra_number },
            { label: 'FCRA Status', value: item.fcra_status }
          ]
        },
        {
          title: 'Tax Certifications',
          fields: [
            { label: '12A Certificate', value: item.section_12a },
            { label: '80G Certificate', value: item.section_80g }
          ]
        },
        {
          title: 'Organization Details',
          fields: [
            { label: 'Sectors', value: item.sector?.join(', ') },
            { label: 'Description', value: item.ngo_description },
            { label: 'Address', value: item.registered_address }
          ]
        },
        {
          title: 'Documents',
          fields: [
            { label: 'Documents', value: item.verification_documents?.join(', ') }
          ]
        }
      ];
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <Button onClick={onBack} variant="outline" className="mb-6">
        <ChevronLeft className="w-4 h-4 mr-2" />
        Back to List
      </Button>

      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-2xl">
                {type === 'individuals'
                  ? item.name
                  : type === 'companies'
                    ? item.company_name
                    : item.ngo_name}
              </CardTitle>
              <CardDescription>
                Submitted on {new Date(item.submitted_at).toLocaleDateString()}
              </CardDescription>
            </div>
            <Badge variant="outline">
              {item.documents_verified}/{item.documents_total} Documents Verified
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Detail Sections */}
      <div className="grid gap-6 mb-6">
        {getDetailSections().map((section) => (
          <Card key={section.title}>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">{section.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {section.fields.map((field) => (
                  <div key={field.label} className="space-y-1">
                    <p className="text-sm text-gray-500 font-medium">{field.label}</p>
                    <p className="text-sm text-gray-900 break-words">{field.value || '—'}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Action Section */}
      <Card className="border-green-200 bg-green-50">
        <CardHeader>
          <CardTitle className="text-lg">Verification Decision</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {showRejectForm ? (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Rejection Reason</label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Explain why you are rejecting this verification..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  rows={3}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={onReject}
                  disabled={actionLoading || !rejectionReason.trim()}
                  className="flex-1 bg-red-600 hover:bg-red-700"
                >
                  <X className="w-4 h-4 mr-2" />
                  Confirm Rejection
                </Button>
                <Button onClick={() => setShowRejectForm(false)} variant="outline">
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <div className="flex gap-3">
              <Button
                onClick={onApprove}
                disabled={actionLoading}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                <Check className="w-4 h-4 mr-2" />
                Approve Verification
              </Button>
              <Button
                onClick={() => setShowRejectForm(true)}
                disabled={actionLoading}
                variant="outline"
                className="flex-1 border-red-200 hover:bg-red-50"
              >
                <X className="w-4 h-4 mr-2" />
                Reject Verification
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
