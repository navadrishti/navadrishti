'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, Building2, Building, ArrowRight } from 'lucide-react';

interface VerificationCount {
  individuals: number;
  companies: number;
  ngos: number;
}

export default function CADashboardClient() {
  const [counts, setCounts] = useState<VerificationCount>({ individuals: 0, companies: 0, ngos: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchCounts();
  }, []);

  const fetchCounts = async () => {
    try {
      setLoading(true);
      setError('');

      const [individualsRes, companiesRes, ngosRes] = await Promise.all([
        fetch('/api/ca/individuals?status=unverified', { credentials: 'include' }),
        fetch('/api/ca/companies?status=unverified', { credentials: 'include' }),
        fetch('/api/ca/ngos?status=unverified', { credentials: 'include' })
      ]);

      const [individualsData, companiesData, ngosData] = await Promise.all([
        individualsRes.json(),
        companiesRes.json(),
        ngosRes.json()
      ]);

      setCounts({
        individuals: individualsData.count || 0,
        companies: companiesData.count || 0,
        ngos: ngosData.count || 0
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to load verification counts');
      console.error('Error fetching counts:', err);
    } finally {
      setLoading(false);
    }
  };

  const totalPending = counts.individuals + counts.companies + counts.ngos;

  const renderBlock = (
    title: string,
    count: number,
    icon: React.ReactNode,
    href: string,
    colorClasses: string
  ) => {
    return (
      <Link href={href}>
        <Card className={`h-full border-2 hover:shadow-lg transition-all cursor-pointer ${colorClasses}`}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              {icon}
              <Badge variant="outline" className="bg-white">
                {title}
              </Badge>
            </div>
            <CardTitle className="text-4xl font-bold mt-4">{count}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium opacity-75">Pending {title.toLowerCase()}</p>
            <div className="flex items-center gap-1 mt-3 text-sm font-medium">
              View Details <ArrowRight className="w-4 h-4" />
            </div>
          </CardContent>
        </Card>
      </Link>
    );
  };

  if (error) {
    return (
      <div className="space-y-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-700">{error}</p>
            <Button onClick={fetchCounts} className="mt-4">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">CA Verification Dashboard</h1>
        <p className="mt-2 text-slate-600">Review and approve pending individuals, companies, and NGOs</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {renderBlock(
            'Individuals',
            counts.individuals,
            <Users className="h-6 w-6 text-blue-600" />,
            '/ca/individuals',
            'border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100'
          )}

          {renderBlock(
            'Companies',
            counts.companies,
            <Building2 className="h-6 w-6 text-purple-600" />,
            '/ca/companies',
            'border-purple-200 bg-gradient-to-br from-purple-50 to-purple-100'
          )}

          {renderBlock(
            'NGOs',
            counts.ngos,
            <Building className="h-6 w-6 text-green-600" />,
            '/ca/ngos',
            'border-green-200 bg-gradient-to-br from-green-50 to-green-100'
          )}

          <Card className="border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="bg-white">
                  Total
                </Badge>
              </div>
              <CardTitle className="text-4xl font-bold mt-4">{totalPending}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium opacity-75">Total pending verifications</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle>Verification Overview</CardTitle>
          <CardDescription>Click on any block above to review pending verifications</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="font-medium text-slate-900">Individual Verifications</p>
                  <p className="text-sm text-slate-600">Review personal details, documents, and qualifications</p>
                </div>
              </div>
              <Badge variant="secondary">{counts.individuals}</Badge>
            </div>

            <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg border border-purple-200">
              <div className="flex items-center gap-3">
                <Building2 className="h-5 w-5 text-purple-600" />
                <div>
                  <p className="font-medium text-slate-900">Company Verifications</p>
                  <p className="text-sm text-slate-600">Check GST, PAN, CIN and registration documents</p>
                </div>
              </div>
              <Badge variant="secondary">{counts.companies}</Badge>
            </div>

            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center gap-3">
                <Building className="h-5 w-5 text-green-600" />
                <div>
                  <p className="font-medium text-slate-900">NGO Verifications</p>
                  <p className="text-sm text-slate-600">Verify registration, FCRA, 12A, and 80G status</p>
                </div>
              </div>
              <Badge variant="secondary">{counts.ngos}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
