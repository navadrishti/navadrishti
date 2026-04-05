'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { VerificationBadge } from '@/components/verification-badge';
import Link from 'next/link';
import type { VerificationCaseListItem } from '@/lib/types/verification';

export default function CACasesPage() {
  const [cases, setCases] = useState<VerificationCaseListItem[]>([]);
  const [filteredCases, setFilteredCases] = useState<VerificationCaseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [entityFilter, setEntityFilter] = useState('all');

  useEffect(() => {
    fetchCases();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [cases, searchQuery, statusFilter, priorityFilter, entityFilter]);

  const fetchCases = async () => {
    try {
      setLoading(true);
      
      // TODO: Replace with actual API call
      // const response = await fetch('/api/ca/cases', {
      //   headers: { Authorization: `Bearer ${localStorage.getItem('ca_token')}` }
      // });
      // const data = await response.json();
      
      // Mock data - Only verified and cancelled cases for History
      setTimeout(() => {
        const mockCases: VerificationCaseListItem[] = [
          {
            id: 'VC-2026-006',
            entity_name: 'Rural Health Initiative',
            entity_type: 'ngo',
            status: 'ca_approved',
            priority: 'medium',
            submitted_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
            assigned_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
            days_pending: 15
          },
          {
            id: 'VC-2026-007',
            entity_name: 'Clean Water Foundation',
            entity_type: 'ngo',
            status: 'ca_approved',
            priority: 'high',
            submitted_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
            assigned_at: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString(),
            days_pending: 10
          },
          {
            id: 'VC-2026-008',
            entity_name: 'Digital Services Ltd',
            entity_type: 'company',
            status: 'ca_rejected',
            priority: 'low',
            submitted_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
            assigned_at: new Date(Date.now() - 19 * 24 * 60 * 60 * 1000).toISOString(),
            days_pending: 20
          },
          {
            id: 'VC-2026-009',
            entity_name: 'Women Empowerment Trust',
            entity_type: 'ngo',
            status: 'ca_approved',
            priority: 'urgent',
            submitted_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
            assigned_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
            days_pending: 8
          },
          {
            id: 'VC-2026-010',
            entity_name: 'Global Consulting Group',
            entity_type: 'company',
            status: 'ca_approved',
            priority: 'medium',
            submitted_at: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
            assigned_at: new Date(Date.now() - 11 * 24 * 60 * 60 * 1000).toISOString(),
            days_pending: 12
          },
          {
            id: 'VC-2026-011',
            entity_name: 'Fake NGO Trust',
            entity_type: 'ngo',
            status: 'ca_rejected',
            priority: 'high',
            submitted_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
            assigned_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
            days_pending: 6
          }
        ];
        
        setCases(mockCases);
        setLoading(false);
      }, 500);
      
    } catch (error) {
      console.error('Failed to fetch cases:', error);
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...cases];

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(c => 
        c.entity_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.id.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(c => c.status === statusFilter);
    }

    // Priority filter
    if (priorityFilter !== 'all') {
      filtered = filtered.filter(c => c.priority === priorityFilter);
    }

    // Entity type filter
    if (entityFilter !== 'all') {
      filtered = filtered.filter(c => c.entity_type === entityFilter);
    }

    setFilteredCases(filtered);
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      assigned_to_ca: { label: 'New Assignment', color: 'bg-blue-100 text-blue-800' },
      under_ca_review: { label: 'In Review', color: 'bg-yellow-100 text-yellow-800' },
      clarification_needed: { label: 'Clarification Needed', color: 'bg-orange-100 text-orange-800' },
      ca_approved: { label: 'Approved', color: 'bg-green-100 text-green-800' },
      ca_rejected: { label: 'Rejected', color: 'bg-red-100 text-red-800' }
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.assigned_to_ca;
    return <Badge className={config.color}>{config.label}</Badge>;
  };

  const getPriorityBadge = (priority: string) => {
    const priorityConfig = {
      urgent: { label: 'Urgent', color: 'bg-red-100 text-red-800' },
      high: { label: 'High', color: 'bg-orange-100 text-orange-800' },
      medium: { label: 'Medium', color: 'bg-blue-100 text-blue-800' },
      low: { label: 'Low', color: 'bg-gray-100 text-gray-800' }
    };
    
    const config = priorityConfig[priority as keyof typeof priorityConfig] || priorityConfig.medium;
    return <Badge className={config.color}>{config.label}</Badge>;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Header Skeleton */}
        <div>
          <Skeleton className="h-9 w-64 mb-2" />
          <Skeleton className="h-6 w-96" />
        </div>

        {/* Filters Skeleton */}
        <Card className="bg-white border-blue-200">
          <CardHeader>
            <Skeleton className="h-6 w-16" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </CardContent>
        </Card>

        {/* Cases List Skeleton */}
        <div className="space-y-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="bg-blue-50 border-blue-200">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center space-x-3">
                      <Skeleton className="h-6 w-48" />
                      <Skeleton className="h-5 w-16" />
                    </div>
                    <div className="flex items-center space-x-4">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-4 w-4 rounded-full" />
                      <Skeleton className="h-4 w-28" />
                    </div>
                  </div>
                  <Skeleton className="h-6 w-24" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-blue-900">Verification History</h1>
        <p className="mt-2 text-blue-700">View all completed cases (approved and rejected)</p>
      </div>

      {/* Filters */}
      <Card className="bg-white border-blue-200">
        <CardHeader>
          <CardTitle className="text-lg text-blue-900">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div className="relative">
              <Input
                placeholder="Search cases..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="ca_approved">Approved</SelectItem>
                <SelectItem value="ca_rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>

            {/* Priority Filter */}
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>

            {/* Entity Type Filter */}
            <Select value={entityFilter} onValueChange={setEntityFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Entity Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="ngo">NGO</SelectItem>
                <SelectItem value="company">Company</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Cases List */}
      <div className="space-y-4">
        {filteredCases.map((case_) => (
          <Link href={`/ca/cases/${case_.id}`} key={case_.id}>
            <Card className="transition-shadow bg-blue-50 border-blue-200 hover:shadow-lg cursor-pointer">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    {/* Header Row */}
                    <div className="flex items-center space-x-3 mb-3">
                      <h3 className="text-lg font-semibold text-blue-900">{case_.entity_name}</h3>
                      <Badge variant="outline" className="text-xs">
                        {case_.entity_type.toUpperCase()}
                      </Badge>
                    </div>

                    {/* Details Row */}
                    <div className="flex flex-wrap items-center gap-4 text-sm text-blue-700 mb-2">
                      <span className="font-mono">#{case_.id}</span>
                      <span>•</span>
                      <span>Submitted: {new Date(case_.submitted_at).toLocaleDateString()}</span>
                      <span>•</span>
                      <span>Completed {case_.days_pending} days ago</span>
                    </div>
                  </div>

                  {/* Status Display - No Review Button for Completed Cases */}
                  <div className="text-right">
                    <div className="text-sm">
                      {case_.status === 'ca_approved' ? (
                        <div className="flex justify-end">
                          <VerificationBadge status="verified" size="sm" showText={true} />
                        </div>
                      ) : (
                        <div className="text-orange-600 font-semibold text-lg">✗ Rejected</div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}

        {filteredCases.length === 0 && (
          <Card className="bg-white border-blue-200">
            <CardContent className="text-center py-12">
              <p className="text-blue-500">No cases found matching your filters</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
