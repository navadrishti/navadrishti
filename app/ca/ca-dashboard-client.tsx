'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, Building2, Building, ArrowRight, Search, Check, X, FileText, Eye, Download } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import Image from 'next/image';

interface Individual {
  id: number;
  name: string;
  email: string;
  profession: string;
  verification_status: string;
}

interface Company {
  id: number;
  company_name: string;
  email: string;
  business_description: string;
  verification_status: string;
}

interface NGO {
  id: number;
  ngo_name: string;
  email: string;
  ngo_description: string;
  verification_status: string;
}

type FilterStatus = 'unverified' | 'verified' | 'all';

const TABS: { label: string; value: FilterStatus }[] = [
  { label: 'Unverified', value: 'unverified' },
  { label: 'Verified',   value: 'verified'   },
  { label: 'All',        value: 'all'         },
];

function StatusBadge({ status }: { status: string }) {
  const isVerified = status === 'verified';
  return (
    <Badge
      variant="outline"
      className={
        isVerified
          ? 'border-green-200 bg-green-50 text-green-700 text-xs'
          : 'border-amber-200 bg-amber-50 text-amber-700 text-xs'
      }
    >
      {status}
    </Badge>
  );
}

function ColumnCard({
  title,
  icon,
  bgClass,
  count,
  href,
  loading,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  bgClass: string;
  count: number;
  href: string;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className={`p-1.5 rounded-lg ${bgClass}`}>{icon}</span>
          {title}
          <span className="ml-auto text-xs font-normal text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">
            {count}
          </span>
        </CardTitle>
        <p className="text-xs text-slate-400">Scroll to see all results</p>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col px-4 pb-2">
        <div className="overflow-y-auto max-h-80 space-y-2 pr-1">
          {loading
            ? [1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)
            : children}
        </div>
      </CardContent>

      <div className="px-4 pb-4 pt-2 border-t border-slate-100">
        <Link
          href={href}
          className="inline-flex items-center justify-center gap-1 w-full h-8 rounded-md border border-input bg-background text-xs font-medium text-slate-700 hover:bg-slate-100"
        >
          See full list <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </Card>
  );
}

export default function CADashboardClient() {
  const [individuals, setIndividuals] = useState<Individual[]>([]);
  const [companies, setCompanies]     = useState<Company[]>([]);
  const [ngos, setNGOs]               = useState<NGO[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('unverified');
  const [searchQuery, setSearchQuery]   = useState('');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [selectedType, setSelectedType] = useState<'individuals' | 'companies' | 'ngos' | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  useEffect(() => {
    fetchData();
  }, [filterStatus]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError('');

      const [individualsRes, companiesRes, ngosRes] = await Promise.all([
        fetch(`/api/ca/individuals?status=${filterStatus}`, { credentials: 'include' }),
        fetch(`/api/ca/companies?status=${filterStatus}`,  { credentials: 'include' }),
        fetch(`/api/ca/ngos?status=${filterStatus}`,       { credentials: 'include' }),
      ]);

      const [individualsData, companiesData, ngosData] = await Promise.all([
        individualsRes.json(),
        companiesRes.json(),
        ngosRes.json(),
      ]);

      setIndividuals(individualsData.data || []);
      setCompanies(companiesData.data     || []);
      setNGOs(ngosData.data               || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const q = searchQuery.toLowerCase();

  const filteredIndividuals = useMemo(() =>
    individuals.filter(ind =>
      !q ||
      ind.name.toLowerCase().includes(q) ||
      ind.email.toLowerCase().includes(q) ||
      ind.profession.toLowerCase().includes(q)
    ), [individuals, q]);

  const filteredCompanies = useMemo(() =>
    companies.filter(comp =>
      !q ||
      comp.company_name.toLowerCase().includes(q) ||
      comp.email.toLowerCase().includes(q) ||
      comp.business_description.toLowerCase().includes(q)
    ), [companies, q]);

  const filteredNGOs = useMemo(() =>
    ngos.filter(ngo =>
      !q ||
      ngo.ngo_name.toLowerCase().includes(q) ||
      ngo.email.toLowerCase().includes(q) ||
      ngo.ngo_description.toLowerCase().includes(q)
    ), [ngos, q]);

  const handleItemClick = (item: any, type: 'individuals' | 'companies' | 'ngos') => {
    setSelectedItem(item);
    setSelectedType(type);
    setRejectionReason('');
  };

  const handleAction = async (action: 'approve' | 'reject') => {
    if (!selectedItem || !selectedType) return;

    if (action === 'reject' && !rejectionReason.trim()) {
      alert('Please provide a reason for rejection');
      return;
    }

    setActionLoading(true);
    try {
      const response = await fetch('/api/ca/verification-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          entity_type: selectedType,
          entity_id: selectedItem.id,
          action: action === 'approve' ? 'approve' : 'reject',
          reason: rejectionReason
        })
      });

      if (response.ok) {
        alert(`${selectedType.slice(0, -1)} ${action}d successfully`);
        // Remove from the list
        if (selectedType === 'individuals') {
          setIndividuals(individuals.filter(ind => ind.id !== selectedItem.id));
        } else if (selectedType === 'companies') {
          setCompanies(companies.filter(comp => comp.id !== selectedItem.id));
        } else if (selectedType === 'ngos') {
          setNGOs(ngos.filter(ngo => ngo.id !== selectedItem.id));
        }
        setSelectedItem(null);
        setSelectedType(null);
        setRejectionReason('');
      } else {
        alert('Failed to process action');
      }
    } catch (error) {
      console.error('Action failed:', error);
      alert('Failed to process action');
    } finally {
      setActionLoading(false);
    }
  };

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-6">
          <p className="text-red-700">{error}</p>
          <Button onClick={fetchData} className="mt-4">Retry</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">CA Verification Dashboard</h1>
        <p className="mt-1 text-slate-500">Review and approve pending individuals, companies, and NGOs</p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by name, email, or description…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Pill tabs */}
        <div className="flex bg-slate-100 rounded-lg p-1 gap-1 self-start sm:self-auto">
          {TABS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setFilterStatus(value)}
              className={[
                'px-4 py-1.5 rounded-md text-sm font-medium transition-all',
                filterStatus === value
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Three columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Individuals */}
        <ColumnCard
          title="Individuals"
          icon={<Users className="h-4 w-4 text-blue-600" />}
          bgClass="bg-blue-50"
          count={filteredIndividuals.length}
          href="/ca/individuals"
          loading={loading}
        >
          {filteredIndividuals.length === 0 ? (
            <p className="text-sm text-slate-400 py-3">No individuals found</p>
          ) : filteredIndividuals.map(ind => (
            <div
              key={ind.id}
              className="p-3 rounded-lg border border-slate-100 bg-blue-50/40 cursor-pointer hover:bg-blue-100/60 transition-colors"
              onClick={() => handleItemClick(ind, 'individuals')}
            >
              <p className="text-sm font-medium text-slate-900">{ind.name}</p>
              <p className="text-xs text-slate-500">{ind.profession}</p>
              <p className="text-xs text-slate-400">{ind.email}</p>
              <div className="mt-2"><StatusBadge status={ind.verification_status} /></div>
            </div>
          ))}
        </ColumnCard>

        {/* Companies */}
        <ColumnCard
          title="Companies"
          icon={<Building2 className="h-4 w-4 text-purple-600" />}
          bgClass="bg-purple-50"
          count={filteredCompanies.length}
          href="/ca/companies"
          loading={loading}
        >
          {filteredCompanies.length === 0 ? (
            <p className="text-sm text-slate-400 py-3">No companies found</p>
          ) : filteredCompanies.map(comp => (
            <div
              key={comp.id}
              className="p-3 rounded-lg border border-slate-100 bg-purple-50/40 cursor-pointer hover:bg-purple-100/60 transition-colors"
              onClick={() => handleItemClick(comp, 'companies')}
            >
              <p className="text-sm font-medium text-slate-900">{comp.company_name}</p>
              <p className="text-xs text-slate-500 line-clamp-1">{comp.business_description}</p>
              <p className="text-xs text-slate-400">{comp.email}</p>
              <div className="mt-2"><StatusBadge status={comp.verification_status} /></div>
            </div>
          ))}
        </ColumnCard>

        {/* NGOs */}
        <ColumnCard
          title="NGOs"
          icon={<Building className="h-4 w-4 text-green-600" />}
          bgClass="bg-green-50"
          count={filteredNGOs.length}
          href="/ca/ngos"
          loading={loading}
        >
          {filteredNGOs.length === 0 ? (
            <p className="text-sm text-slate-400 py-3">No NGOs found</p>
          ) : filteredNGOs.map(ngo => (
            <div
              key={ngo.id}
              className="p-3 rounded-lg border border-slate-100 bg-green-50/40 cursor-pointer hover:bg-green-100/60 transition-colors"
              onClick={() => handleItemClick(ngo, 'ngos')}
            >
              <p className="text-sm font-medium text-slate-900">{ngo.ngo_name}</p>
              <p className="text-xs text-slate-500 line-clamp-1">{ngo.ngo_description}</p>
              <p className="text-xs text-slate-400">{ngo.email}</p>
              <div className="mt-2"><StatusBadge status={ngo.verification_status} /></div>
            </div>
          ))}
        </ColumnCard>
      </div>

      {/* Item Details Dialog */}
      <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedType === 'individuals' && selectedItem?.name}
              {selectedType === 'companies' && selectedItem?.company_name}
              {selectedType === 'ngos' && selectedItem?.ngo_name}
            </DialogTitle>
            <DialogDescription>
              Review and verify this {selectedType?.slice(0, -1)}'s details
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
                    {selectedType === 'individuals' && (
                      <>
                        <div><label className="text-sm font-medium">Full Name</label><p className="text-sm text-slate-600">{selectedItem.name}</p></div>
                        <div><label className="text-sm font-medium">Aadhaar Number</label><p className="text-sm text-slate-600">{selectedItem.aadhaar}</p></div>
                        <div><label className="text-sm font-medium">PAN Number</label><p className="text-sm text-slate-600">{selectedItem.pan}</p></div>
                        <div><label className="text-sm font-medium">Email</label><p className="text-sm text-slate-600">{selectedItem.email}</p></div>
                        <div><label className="text-sm font-medium">Phone</label><p className="text-sm text-slate-600">{selectedItem.phone}</p></div>
                        <div><label className="text-sm font-medium">Profession</label><p className="text-sm text-slate-600">{selectedItem.profession}</p></div>
                      </>
                    )}
                    {selectedType === 'companies' && (
                      <>
                        <div><label className="text-sm font-medium">Company Name</label><p className="text-sm text-slate-600">{selectedItem.company_name}</p></div>
                        <div><label className="text-sm font-medium">GST Number</label><p className="text-sm text-slate-600">{selectedItem.gst}</p></div>
                        <div><label className="text-sm font-medium">PAN Number</label><p className="text-sm text-slate-600">{selectedItem.pan}</p></div>
                        <div><label className="text-sm font-medium">CIN</label><p className="text-sm text-slate-600">{selectedItem.cin}</p></div>
                        <div><label className="text-sm font-medium">Email</label><p className="text-sm text-slate-600">{selectedItem.email}</p></div>
                        <div><label className="text-sm font-medium">Phone</label><p className="text-sm text-slate-600">{selectedItem.phone}</p></div>
                      </>
                    )}
                    {selectedType === 'ngos' && (
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
                    {selectedType === 'individuals' && (
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
                    {selectedType === 'companies' && (
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
                    {selectedType === 'ngos' && (
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
  );
}