import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { getTokenClaims } from '@/lib/auth';
import { calculatePaymentProgress } from '@/lib/service-engagement';
import { isCampaignVolunteerAssignment } from '@/lib/campaign-volunteer-attendance';

import { parseJsonObject, getErrorMessage } from '@/lib/utils';

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function loadAssignment(assignmentId: string) {
  const { data, error } = await supabase
    .from('service_engagement_assignments')
    .select('*')
    .eq('id', assignmentId)
    .maybeSingle();

  if (error || !data) {
    throw new Error('Assignment not found');
  }

  return data;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!getTokenClaims(request)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { id } = await params;
    const assignment = await loadAssignment(id);

    const { data, error } = await supabase
      .from('service_attendance_entries')
      .select('*')
      .eq('assignment_id', assignment.id)
      .order('attendance_date', { ascending: false });

    if (error) {
      throw error;
    }

    const entries = data || [];
    const totalDue = entries.reduce((sum, entry) => sum + toNumber(entry.amount_due), 0);
    const paidTotal = entries
      .filter((entry) => entry.payment_status === 'paid')
      .reduce((sum, entry) => sum + toNumber(entry.amount_due), 0);

    return NextResponse.json({
      success: true,
      data: {
        assignment: {
          ...assignment,
          meta: {
            ...parseJsonObject(assignment.meta),
            attendance_summary: {
              total_entries: entries.length,
              days_attended: entries.filter(
                (e) => String(e.attendance_status || '').toLowerCase() === 'present'
              ).length,
              total_due: totalDue,
              paid_total: paidTotal,
              payment_progress: calculatePaymentProgress(paidTotal, totalDue),
              last_attendance_at: entries.length ? entries[0].attendance_date : null,
            },
          },
        },
        attendance: entries,
        marking_surface: 'gram_app',
        campaign_volunteer: isCampaignVolunteerAssignment(assignment),
      },
    });
  } catch (error) {
    console.error('Attendance fetch error:', error);
    return NextResponse.json({ error: getErrorMessage(error) || 'Failed to fetch attendance' }, { status: 500 });
  }
}

/** Platform marking disabled — sealed photo attendance is done in the GRAM App (PWA). */
export async function POST(_request: NextRequest, _ctx: { params: Promise<{ id: string }> }) {
  return NextResponse.json(
    {
      error:
        'Attendance must be marked in the GRAM App with sealed photos. Open the app to mark present for today.',
      code: 'ATTENDANCE_PWA_ONLY',
    },
    { status: 403 }
  );
}
