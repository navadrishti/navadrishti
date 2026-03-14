'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import type { CADashboardStats, VerificationCaseListItem } from '@/lib/types/verification';

export default function CADashboard() {
  const [stats, setStats] = useState<CADashboardStats | null>(null);
  const [recentCases, setRecentCases] = useState<VerificationCaseListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // TODO: Replace with actual API call
      // const response = await fetch('/api/ca/dashboard', {
      //   headers: { Authorization: `Bearer ${localStorage.getItem('ca_token')}` }
      // });
      // const data = await response.json();
      
      // Mock data for now
      setTimeout(() => {
        setStats({
          total_assigned: 24,
          pending_review: 8,
          under_review: 3,
          completed_today: 2,
          avg_review_time_hours: 18.5,
          pending_urgent: 1
        });
        
        setRecentCases([
          {
            id: 'VC-2026-001',
            entity_name: 'Green Earth Foundation',
            entity_type: 'ngo',
            status: 'assigned_to_ca',
            priority: 'urgent',
            submitted_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
            assigned_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
            days_pending: 2
          },
          {
            id: 'VC-2026-002',
            entity_name: 'Tech Solutions Pvt Ltd',
            entity_type: 'company',
            status: 'under_ca_review',
            priority: 'high',
            submitted_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
            assigned_at: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
            days_pending: 5
          },
          {
            id: 'VC-2026-003',
            entity_name: 'Hope for Children Trust',
            entity_type: 'ngo',
            status: 'assigned_to_ca',
            priority: 'medium',
            submitted_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
            assigned_at: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
            days_pending: 3
          },
          {
            id: 'VC-2026-004',
            entity_name: 'Education For All Society',
            entity_type: 'ngo',
            status: 'clarification_needed',
            priority: 'low',
            submitted_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
            assigned_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
            days_pending: 7
          },
          {
            id: 'VC-2026-005',
            entity_name: 'InnovateCorp India Ltd',
            entity_type: 'company',
            status: 'assigned_to_ca',
            priority: 'high',
            submitted_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
            assigned_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
            days_pending: 1
          }
        ]);
        
        setLoading(false);
      }, 500);
      
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      assigned_to_ca: { label: 'New Assignment', variant: 'default' as const, color: 'bg-blue-100 text-blue-800' },
      under_ca_review: { label: 'In Review', variant: 'secondary' as const, color: 'bg-yellow-100 text-yellow-800' },
      clarification_needed: { label: 'Clarification Needed', variant: 'outline' as const, color: 'bg-orange-100 text-orange-800' },
      ca_approved: { label: 'Approved', variant: 'default' as const, color: 'bg-green-100 text-green-800' },
      ca_rejected: { label: 'Rejected', variant: 'destructive' as const, color: 'bg-red-100 text-red-800' }
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
      <div className="space-y-8">
        {/* Welcome Section Skeleton */}
        <div>
          <Skeleton className="h-9 w-80 mb-2" />
          <Skeleton className="h-6 w-96" />
        </div>

        {/* Stats Grid Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="bg-white border-blue-200">
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-9 w-16 mb-2" />
                <Skeleton className="h-3 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Cases List Skeleton */}
        <Card className="bg-white border-blue-200">
          <CardHeader>
            <Skeleton className="h-7 w-48 mb-2" />
            <Skeleton className="h-5 w-64" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="border border-blue-200 rounded-lg p-4 bg-blue-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center space-x-3">
                        <Skeleton className="h-6 w-48" />
                        <Skeleton className="h-5 w-16" />
                        <Skeleton className="h-5 w-16" />
                      </div>
                      <div className="flex items-center space-x-4">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-4 w-4 rounded-full" />
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-4 w-4 rounded-full" />
                        <Skeleton className="h-5 w-24" />
                      </div>
                    </div>
                    <Skeleton className="h-9 w-20" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div>
        <h1 className="text-3xl font-bold text-blue-900">Verification Dashboard</h1>
        <p className="mt-2 text-blue-700">Review and approve pending verification cases assigned to you</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Assigned */}
        <Card className="bg-white border-blue-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-blue-600">Total Assigned</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-900">{stats?.total_assigned || 0}</div>
            <p className="text-xs text-blue-500 mt-1">All time cases</p>
          </CardContent>
        </Card>

        {/* Pending Review */}
        <Card className="bg-white border-orange-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-orange-600">Pending Review</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">{stats?.pending_review || 0}</div>
            <p className="text-xs text-orange-500 mt-1">
              {stats?.pending_urgent ? `${stats.pending_urgent} urgent` : 'No urgent cases'}
            </p>
          </CardContent>
        </Card>

        {/* Under Review */}
        <Card className="bg-white border-blue-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-blue-600">Under Review</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{stats?.under_review || 0}</div>
            <p className="text-xs text-blue-500 mt-1">Currently reviewing</p>
          </CardContent>
        </Card>

        {/* Completed Today */}
        <Card className="bg-white border-green-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-green-600">Completed Today</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{stats?.completed_today || 0}</div>
            <p className="text-xs text-green-500 mt-1">
              Avg: {stats?.avg_review_time_hours.toFixed(1)}h per case
            </p>
          </CardContent>
        </Card>
      </div>

      {/* All Pending Cases */}
      <Card className="bg-white border-blue-200">
        <CardHeader>
          <CardTitle className="text-blue-900">All Pending Cases</CardTitle>
          <CardDescription className="text-blue-600">Cases requiring your review and action</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentCases.map((case_) => (
              <div 
                key={case_.id} 
                className="border border-blue-200 rounded-lg p-4 hover:border-orange-400 hover:shadow-md transition-all bg-blue-50"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="font-semibold text-blue-900">{case_.entity_name}</h3>
                      <Badge variant="outline" className="text-xs">
                        {case_.entity_type.toUpperCase()}
                      </Badge>
                      {getPriorityBadge(case_.priority)}
                    </div>
                    
                    <div className="flex items-center space-x-4 text-sm text-blue-700">
                      <span>Case ID: #{case_.id}</span>
                      <span>•</span>
                      <span>Submitted {case_.days_pending} days ago</span>
                      <span>•</span>
                      {getStatusBadge(case_.status)}
                    </div>
                  </div>
                  
                  <Link href={`/ca/cases/${case_.id}`}>
                    <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white">
                      Review
                    </Button>
                  </Link>
                </div>
              </div>
            ))}

            {recentCases.length === 0 && (
              <div className="text-center py-8 text-blue-500">
                <p>No pending cases at the moment</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
