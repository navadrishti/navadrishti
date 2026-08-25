import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { supabase } from '@/lib/db';
import { JWT_SECRET } from '@/lib/auth';
import { calculatePaymentProgress } from '@/lib/service-engagement';
import { isCampaignVolunteerAssignment } from '@/lib/campaign-volunteer-assignment';

interface JWTPayload {
  id: number;
  user_type: string;
  email?: string;
  name?: string;
}

function safeJson(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, any>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

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
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    jwt.verify(token, JWT_SECRET) as JWTPayload;

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
            ...safeJson(assignment.meta),
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
  } catch (error: any) {
    console.error('Attendance fetch error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to fetch attendance' }, { status: 500 });
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
