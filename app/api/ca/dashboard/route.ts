// CA Dashboard API - Mock implementation
import { NextRequest, NextResponse } from 'next/server';
import type { CADashboardStats, VerificationCaseListItem } from '@/lib/types/verification';

export async function GET(request: NextRequest) {
  try {
    // TODO: Verify CA authentication
    // const authHeader = request.headers.get('authorization');
    // if (!authHeader) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // }

    // Mock stats data
    const stats: CADashboardStats = {
      total_assigned: 24,
      pending_review: 8,
      under_review: 3,
      completed_today: 2,
      avg_review_time_hours: 18.5,
      pending_urgent: 1
    };

    // Mock recent cases
    const recentCases: VerificationCaseListItem[] = [
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
      }
    ];

    return NextResponse.json({
      success: true,
      stats,
      recentCases
    });

  } catch (error) {
    console.error('CA dashboard error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data' },
      { status: 500 }
    );
  }
}
