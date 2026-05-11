'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, Check, X, FileText, Eye, Download, Users, Building2, Building } from 'lucide-react';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import Image from 'next/image';

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
  const [rejectionReason, setRejectionReason] = useState('');

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

    if (action === 'reject' && !rejectionReason.trim()) {
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
          reason: rejectionReason
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

  const getIcon = () => {
    switch (type) {
      case 'individuals': return <Users className="h-5 w-5 text-blue-600" />;
      case 'companies': return <Building2 className="h-5 w-5 text-purple-600" />;
      case 'ngos': return <Building className="h-5 w-5 text-green-600" />;
    }
  };

  const getBgClass = () => {
    switch (type) {
      case 'individuals': return 'bg-blue-50';
      case 'companies': return 'bg-purple-50';
      case 'ngos': return 'bg-green-50';
    }
  };

  const getListItemDisplay = (item: VerificationDetail) => {
    if (type === 'individuals') {
      return {
        title: item.name,
        subtitle: item.profession,
        email: item.email,
        status: item.verification_status
      };
    } else if (type === 'companies') {
      return {
        title: item.company_name,
        subtitle: item.business_description,
        email: item.email,
        status: item.verification_status
      };
    } else {
      return {
        title: item.ngo_name,
        subtitle: item.ngo_description,
        email: item.email,
        status: item.verification_status
      };
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-32 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/ca">
            <Button variant="outline" size="sm">
              <ChevronLeft className="w-4 h-4" />
              Back to Dashboard
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <span className={`p-2 rounded-lg ${getBgClass()}`}>{getIcon()}</span>
            <h1 className="text-3xl font-bold">{getDisplayName()}</h1>
          </div>
          <Badge variant="secondary">{items.length} pending</Badge>
        </div>

        {/* Items Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {items.map((item) => {
            const display = getListItemDisplay(item);
            return (
              <Card
                key={item.id}
                className={`cursor-pointer hover:shadow-lg transition-shadow ${getBgClass()}/40 hover:${getBgClass()}/60`}
                onClick={() => setSelectedItem(item)}
              >
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg line-clamp-1">{display.title}</CardTitle>
                  <CardDescription className="line-clamp-2">{display.subtitle}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-sm text-gray-600 line-clamp-1">{display.email}</div>
                  <div className="flex items-center justify-between">
                    <Badge variant="outline">
                      {item.documents_verified || 0}/{item.documents_total || 0} docs
                    </Badge>
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
              <FileText className="w-12 h-12 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">No pending verifications</p>
            </CardContent>
          </Card>
        )}

        {/* Detail Modal */}
        <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {selectedItem && (
                  type === 'individuals' ? selectedItem.name :
                  type === 'companies' ? selectedItem.company_name :
                  selectedItem.ngo_name
                )}
              </DialogTitle>
              <DialogDescription>
                Review and verify this {type.slice(0, -1)}'s details
              </DialogDescription>
            </DialogHeader>

            {selectedItem && (
              <div className="space-y-6">
                {/* Basic Information */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Basic Information</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {type === 'individuals' && (
                        <>
                          <div><label className="text-sm font-medium">Full Name</label><p className="text-sm text-slate-600">{selectedItem.name}</p></div>
                          <div><label className="text-sm font-medium">Aadhaar Number</label><p className="text-sm text-slate-600">{selectedItem.aadhaar}</p></div>
                          <div><label className="text-sm font-medium">PAN Number</label><p className="text-sm text-slate-600">{selectedItem.pan}</p></div>
                          <div><label className="text-sm font-medium">Email</label><p className="text-sm text-slate-600">{selectedItem.email}</p></div>
                          <div><label className="text-sm font-medium">Phone</label><p className="text-sm text-slate-600">{selectedItem.phone}</p></div>
                          <div><label className="text-sm font-medium">Profession</label><p className="text-sm text-slate-600">{selectedItem.profession}</p></div>
                        </>
                      )}
                      {type === 'companies' && (
                        <>
                          <div><label className="text-sm font-medium">Company Name</label><p className="text-sm text-slate-600">{selectedItem.company_name}</p></div>
                          <div><label className="text-sm font-medium">GST Number</label><p className="text-sm text-slate-600">{selectedItem.gst}</p></div>
                          <div><label className="text-sm font-medium">PAN Number</label><p className="text-sm text-slate-600">{selectedItem.pan}</p></div>
                          <div><label className="text-sm font-medium">CIN</label><p className="text-sm text-slate-600">{selectedItem.cin}</p></div>
                          <div><label className="text-sm font-medium">Email</label><p className="text-sm text-slate-600">{selectedItem.email}</p></div>
                          <div><label className="text-sm font-medium">Phone</label><p className="text-sm text-slate-600">{selectedItem.phone}</p></div>
                        </>
                      )}
                      {type === 'ngos' && (
                        <>
                          <div><label className="text-sm font-medium">NGO Name</label><p className="text-sm text-slate-600">{selectedItem.ngo_name}</p></div>
                          <div><label className="text-sm font-medium">Registration Number</label><p className="text-sm text-slate-600">{selectedItem.registration_number}</p></div>
                          <div><label className="text-sm font-medium">FCRA Number</label><p className="text-sm text-slate-600">{selectedItem.fcra_number}</p></div>
                          <div><label className="text-sm font-medium">PAN Number</label><p className="text-sm text-slate-600">{selectedItem.pan}</p></div>
                          <div><label className="text-sm font-medium">Email</label><p className="text-sm text-slate-600">{selectedItem.email}</p></div>
                          <div><label className="text-sm font-medium">Phone</label><p className="text-sm text-slate-600">{selectedItem.phone}</p></div>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Document Viewer */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileText className="w-5 h-5" />
                      Documents
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {type === 'individuals' && (
                        <>
                          {selectedItem.aadhaar_card_url && (
                            <div className="border rounded p-3">
                              <p className="text-sm font-medium mb-2">Aadhaar Card</p>
                              <div className="relative w-full h-32 bg-gray-100 rounded overflow-hidden mb-2">
                                <Image src={selectedItem.aadhaar_card_url} alt="Aadhaar Card" fill className="object-cover" />
                              </div>
                              <Button size="sm" variant="outline" onClick={() => window.open(selectedItem.aadhaar_card_url, '_blank')}>
                                <Eye className="w-3 h-3 mr-1" /> View
                              </Button>
                            </div>
                          )}
                          {selectedItem.pan_card_url && (
                            <div className="border rounded p-3">
                              <p className="text-sm font-medium mb-2">PAN Card</p>
                              <div className="relative w-full h-32 bg-gray-100 rounded overflow-hidden mb-2">
                                <Image src={selectedItem.pan_card_url} alt="PAN Card" fill className="object-cover" />
                              </div>
                              <Button size="sm" variant="outline" onClick={() => window.open(selectedItem.pan_card_url, '_blank')}>
                                <Eye className="w-3 h-3 mr-1" /> View
                              </Button>
                            </div>
                          )}
                        </>
                      )}
                      {type === 'companies' && (
                        <>
                          {selectedItem.pan_card_url && (
                            <div className="border rounded p-3">
                              <p className="text-sm font-medium mb-2">PAN Card</p>
                              <div className="relative w-full h-32 bg-gray-100 rounded overflow-hidden mb-2">
                                <Image src={selectedItem.pan_card_url} alt="PAN Card" fill className="object-cover" />
                              </div>
                              <Button size="sm" variant="outline" onClick={() => window.open(selectedItem.pan_card_url, '_blank')}>
                                <Eye className="w-3 h-3 mr-1" /> View
                              </Button>
                            </div>
                          )}
                          {selectedItem.gst_certificate_url && (
                            <div className="border rounded p-3">
                              <p className="text-sm font-medium mb-2">GST Certificate</p>
                              <div className="w-full h-32 bg-gray-100 rounded flex items-center justify-center mb-2">
                                <FileText className="w-8 h-8 text-gray-400" />
                              </div>
                              <Button size="sm" variant="outline" onClick={() => window.open(selectedItem.gst_certificate_url, '_blank')}>
                                <Eye className="w-3 h-3 mr-1" /> View
                              </Button>
                            </div>
                          )}
                        </>
                      )}
                      {type === 'ngos' && (
                        <>
                          {selectedItem.pan_card_url && (
                            <div className="border rounded p-3">
                              <p className="text-sm font-medium mb-2">PAN Card</p>
                              <div className="relative w-full h-32 bg-gray-100 rounded overflow-hidden mb-2">
                                <Image src={selectedItem.pan_card_url} alt="PAN Card" fill className="object-cover" />
                              </div>
                              <Button size="sm" variant="outline" onClick={() => window.open(selectedItem.pan_card_url, '_blank')}>
                                <Eye className="w-3 h-3 mr-1" /> View
                              </Button>
                            </div>
                          )}
                          {selectedItem.fcra_certificate_url && (
                            <div className="border rounded p-3">
                              <p className="text-sm font-medium mb-2">FCRA Certificate</p>
                              <div className="w-full h-32 bg-gray-100 rounded flex items-center justify-center mb-2">
                                <FileText className="w-8 h-8 text-gray-400" />
                              </div>
                              <Button size="sm" variant="outline" onClick={() => window.open(selectedItem.fcra_certificate_url, '_blank')}>
                                <Eye className="w-3 h-3 mr-1" /> View
                              </Button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Rejection Reason */}
                <div>
                  <label className="text-sm font-medium">Rejection Reason (if rejecting)</label>
                  <Textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Provide reason for rejection..."
                    className="mt-1"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4">
                  <Button
                    onClick={() => handleAction('approve')}
                    disabled={actionLoading}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    {actionLoading ? 'Processing...' : 'Approve'}
                    <Check className="w-4 h-4 ml-2" />
                  </Button>
                  <Button
                    onClick={() => handleAction('reject')}
                    disabled={actionLoading}
                    variant="destructive"
                    className="flex-1"
                  >
                    {actionLoading ? 'Processing...' : 'Reject'}
                    <X className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
