// CA Cases List API - Mock implementation
import { NextRequest, NextResponse } from 'next/server';
import type { VerificationCaseListItem } from '@/lib/types/verification';

export async function GET(request: NextRequest) {
  try {
    // TODO: Verify CA authentication
    // const authHeader = request.headers.get('authorization');
    // if (!authHeader) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // }

    // Get query parameters for filtering
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const entityType = searchParams.get('entity_type');

    // Mock cases data
    let cases: VerificationCaseListItem[] = [
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
      },
      {
        id: 'VC-2026-006',
        entity_name: 'Women Empowerment Foundation',
        entity_type: 'ngo',
        status: 'ca_approved',
        priority: 'medium',
        submitted_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        assigned_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
        days_pending: 10
      }
    ];

    // Apply filters
    if (status) {
      cases = cases.filter(c => c.status === status);
    }
    if (priority) {
      cases = cases.filter(c => c.priority === priority);
    }
    if (entityType) {
      cases = cases.filter(c => c.entity_type === entityType);
    }

    return NextResponse.json({
      success: true,
      cases,
      total: cases.length
    });

  } catch (error) {
    console.error('CA cases list error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch cases' },
      { status: 500 }
    );
  }
}
