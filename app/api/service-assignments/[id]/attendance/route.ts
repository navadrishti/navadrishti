import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { supabase } from '@/lib/db';
import { JWT_SECRET } from '@/lib/auth';
import {
  buildAttendanceMeta,
  calcAttendanceDueAmount,
  calculatePaymentProgress,
  normalizeAttendanceSource,
  normalizeAttendanceStatus,
  normalizeAttendancePaymentStatus,
  normalizeEngagementStatus,
  shouldUseDailyAttendance
} from '@/lib/service-engagement';
import { isCampaignStarted } from '@/lib/format-date';
import {
  isCampaignVolunteerAssignment,
  resolveCampaignIdFromAssignment,
} from '@/lib/campaign-volunteer-assignment';
import {
  getNgoNeedFulfillmentMode,
} from '@/lib/ngo-need-fulfillment';

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

function getLocalDateString(reference: Date = new Date()): string {
  const year = reference.getFullYear();
  const month = String(reference.getMonth() + 1).padStart(2, '0');
  const day = String(reference.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

async function persistAttendanceSummary(assignment: any, entries: any[]) {
  const totalDue = entries.reduce((sum, entry) => sum + toNumber(entry.amount_due), 0);
  const paidTotal = entries
    .filter((entry) => entry.payment_status === 'paid')
    .reduce((sum, entry) => sum + toNumber(entry.amount_due), 0);
  const progress = calculatePaymentProgress(paidTotal, totalDue);

  const summary = {
    total_entries: entries.length,
    days_attended: entries.length,
    total_due: totalDue,
    paid_total: paidTotal,
    payment_progress: progress,
    last_attendance_at: entries.length ? entries[0].attendance_date : null
  };

  await supabase
    .from('service_engagement_assignments')
    .update({
      meta: {
        ...(safeJson(assignment.meta)),
        attendance_summary: summary,
        attendance_entries: entries
      },
      updated_at: new Date().toISOString()
    })
    .eq('id', assignment.id);

  if (assignment.target_type === 'csr_project' && !isCampaignVolunteerAssignment(assignment)) {
    const { data: project } = await supabase
      .from('csr_projects')
      .select('id, metadata')
      .eq('id', assignment.target_id)
      .maybeSingle();

    if (project) {
      await supabase
        .from('csr_projects')
        .update({
          metadata: {
            ...(safeJson(project.metadata)),
            attendance_summary: summary,
            attendance_entries: entries
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', assignment.target_id);
    }
  }
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

    return NextResponse.json({
      success: true,
      data: {
        assignment,
        attendance: data || []
      }
    });
  } catch (error: any) {
    console.error('Attendance fetch error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to fetch attendance' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    const userType = decoded.user_type;
    const { id } = await params;
    const assignment = await loadAssignment(id);
    const body = await request.json();

    const isVolunteerSelfAttendance =
      assignment.application_table === 'service_volunteers' &&
      Number(assignment.assignee_user_id) === Number(decoded.id) &&
      ['ngo', 'individual'].includes(decoded.user_type);

    const isCampaignVolunteer = isCampaignVolunteerAssignment(assignment);

    let serviceRequestMode: ReturnType<typeof getNgoNeedFulfillmentMode> | null = null;
    if (assignment.target_type === 'service_request') {
      const { data: serviceRequest } = await supabase
        .from('service_requests')
        .select('id, category, request_type, ngo_id')
        .eq('id', assignment.target_id)
        .maybeSingle();
      serviceRequestMode = getNgoNeedFulfillmentMode(serviceRequest);
    }

    const isSkillServiceNeedAttendance =
      assignment.target_type === 'service_request' &&
      assignment.application_table === 'service_volunteers' &&
      serviceRequestMode === 'skill_service';

    const isNgoOwnerForRequest =
      assignment.target_type === 'service_request' &&
      Number(assignment.owner_user_id) === Number(decoded.id);

    const isCampaignVolunteerAttendance =
      isCampaignVolunteer &&
      Number(assignment.assignee_user_id) === Number(decoded.id) &&
      ['ngo', 'individual'].includes(decoded.user_type);

    const isNgoAttendance = decoded.user_type === 'ngo';

    if (isSkillServiceNeedAttendance) {
      if (!isNgoAttendance || !isNgoOwnerForRequest) {
        return NextResponse.json(
          { error: 'Only the NGO can mark daily attendance for skill/service needs' },
          { status: 403 }
        );
      }
    } else if (
      assignment.target_type === 'service_request' &&
      assignment.application_table === 'service_volunteers' &&
      isVolunteerSelfAttendance
    ) {
      return NextResponse.json(
        { error: 'Self attendance is not used for NGO needs. CSR campaign attendance is separate.' },
        { status: 403 }
      );
    }

    if (isCampaignVolunteer) {
      if (!isCampaignVolunteerAttendance) {
        return NextResponse.json({ error: 'Only the assigned campaign volunteer can mark attendance' }, { status: 403 });
      }

      const campaignId = resolveCampaignIdFromAssignment(assignment);
      const { data: campaign } = await supabase
        .from('campaigns')
        .select('start_date, end_date, status')
        .eq('id', campaignId)
        .maybeSingle();

      if (!isCampaignStarted(campaign?.start_date as string | null)) {
        return NextResponse.json({ error: 'Attendance opens when the campaign starts' }, { status: 400 });
      }
    } else if (assignment.target_type === 'csr_project' && !isVolunteerSelfAttendance && !isNgoAttendance) {
      return NextResponse.json({ error: 'Only the assigned NGO volunteer or individual volunteer can mark CSR attendance' }, { status: 403 });
    } else if (assignment.target_type !== 'csr_project' && !isCampaignVolunteer && !isVolunteerSelfAttendance && !isNgoAttendance) {
      return NextResponse.json({ error: 'Only the assigned NGO or the volunteer themselves can mark attendance' }, { status: 403 });
    }

    const today = getLocalDateString();
    const requestedAttendanceDate = String(body?.attendanceDate || body?.attendance_date || today);
    const attendanceStatus = normalizeAttendanceStatus(body?.attendanceStatus || body?.attendance_status || 'present');
    const attendanceSource = normalizeAttendanceSource(body?.attendanceSource || body?.attendance_source || 'volunteer_dashboard');
    const ratePerUnit = toNumber(body?.ratePerUnit ?? body?.rate_per_unit ?? assignment.rate_per_unit ?? assignment.meta?.rate_per_unit);
    const { data: actingUser } = await supabase
      .from('users')
      .select('id, ngo_volunteer_capacity, profile_data')
      .eq('id', decoded.id)
      .maybeSingle();

    const actingNgoCapacity = Number(
      actingUser?.ngo_volunteer_capacity ??
      actingUser?.profile_data?.ngo_volunteer_capacity ??
      actingUser?.profile_data?.team_strength ??
      0
    ) || 0;

    if (isVolunteerSelfAttendance && !isCampaignVolunteerAttendance && requestedAttendanceDate !== today) {
      return NextResponse.json({ error: 'Only today\'s attendance can be marked' }, { status: 400 });
    }

    if (isCampaignVolunteerAttendance && requestedAttendanceDate !== today) {
      return NextResponse.json({ error: 'Only today\'s attendance can be marked' }, { status: 400 });
    }

    if (isSkillServiceNeedAttendance && requestedAttendanceDate !== today) {
      return NextResponse.json({ error: 'Past days cannot be marked. Only today\'s attendance is allowed.' }, { status: 400 });
    }

    const units = toNumber(body?.units ?? body?.quantity ?? (
      (isCampaignVolunteerAttendance || isVolunteerSelfAttendance) && userType === 'ngo'
        ? actingNgoCapacity
        : 1
    )) || (
      (isCampaignVolunteerAttendance || isVolunteerSelfAttendance) && userType === 'ngo'
        ? Math.max(1, actingNgoCapacity)
        : 1
    );
    const multiplier = toNumber(body?.multiplier ?? 1) || 1;
    const paymentStatus = normalizeAttendancePaymentStatus(body?.paymentStatus || body?.payment_status || 'pending');
    const markedForUserId = toNumber(body?.markedForUserId ?? body?.marked_for_user_id ?? assignment.assignee_user_id);
    const locationLatitude = body?.locationLatitude ?? body?.location_latitude ?? null;
    const locationLongitude = body?.locationLongitude ?? body?.location_longitude ?? null;
    const locationAccuracy = body?.locationAccuracy ?? body?.location_accuracy ?? null;

    if (isCampaignVolunteer) {
      if (locationLatitude === null || locationLongitude === null) {
        return NextResponse.json({ error: 'Location is required to mark campaign attendance' }, { status: 400 });
      }
    }

    const meta = buildAttendanceMeta({
      targetType: assignment.target_type,
      targetId: assignment.target_id,
      invitationId: assignment.invitation_id,
      applicationTable: assignment.application_table,
      applicationId: assignment.application_id,
      ownerUserId: assignment.owner_user_id,
      assigneeUserId: assignment.assignee_user_id,
      assignedByUserId: assignment.assigned_by_user_id,
      billingCycle: assignment.billing_cycle,
      paymentMode: assignment.payment_mode,
      validUntil: assignment.valid_until,
      ratePerUnit,
      currency: assignment.rate_currency || 'INR',
      attendanceDate: today,
      attendanceStatus,
      attendanceSource,
      markedByUserId: decoded.id,
      units,
      multiplier,
      paymentStatus
    });

    if (locationLatitude !== null || locationLongitude !== null || locationAccuracy !== null) {
      (meta as any).location = {
        latitude: locationLatitude === null ? null : Number(locationLatitude),
        longitude: locationLongitude === null ? null : Number(locationLongitude),
        accuracy: locationAccuracy === null ? null : Number(locationAccuracy),
        shared_at: new Date().toISOString()
      };
    }

    const { data: existingAttendance, error: existingAttendanceError } = await supabase
      .from('service_attendance_entries')
      .select('id')
      .eq('assignment_id', assignment.id)
      .eq('attendance_date', today)
      .maybeSingle();

    if (existingAttendanceError) {
      throw existingAttendanceError;
    }

    if (existingAttendance) {
      return NextResponse.json({ error: 'Attendance for today has already been marked and cannot be edited' }, { status: 409 });
    }

    const amountDue = calcAttendanceDueAmount({
      ...meta,
      attendanceStatus,
      units,
      quantity: units,
      multiplier,
      ratePerUnit
    });

    const { data: attendance, error } = await supabase
      .from('service_attendance_entries')
      .insert({
        assignment_id: assignment.id,
        target_type: assignment.target_type,
        target_id: assignment.target_id,
        application_table: assignment.application_table,
        application_id: assignment.application_id,
        attendance_date: today,
        attendance_status: attendanceStatus,
        attendance_source: attendanceSource,
        marked_by_user_id: decoded.id,
        marked_for_user_id: markedForUserId,
        units,
        multiplier,
        rate_per_unit: ratePerUnit || null,
        amount_due: amountDue,
        payment_status: paymentStatus,
        meta
      })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    const { data: entries } = await supabase
      .from('service_attendance_entries')
      .select('*')
      .eq('assignment_id', assignment.id)
      .order('attendance_date', { ascending: false });

    await persistAttendanceSummary(assignment, entries || []);

    if (assignment.application_table === 'service_volunteers' && assignment.application_id) {
      await supabase
        .from('service_volunteers')
        .update({
          response_meta: {
            ...(safeJson(assignment.meta)),
            attendance_summary: {
              total_entries: entries?.length || 0,
              payment_progress: calculatePaymentProgress(
                (entries || []).filter((entry: any) => entry.payment_status === 'paid').reduce((sum: number, entry: any) => sum + toNumber(entry.amount_due), 0),
                (entries || []).reduce((sum: number, entry: any) => sum + toNumber(entry.amount_due), 0)
              )
            }
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', assignment.application_id);
    }

    return NextResponse.json({ success: true, data: attendance }, { status: 201 });
  } catch (error: any) {
    console.error('Attendance create error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to mark attendance' }, { status: 500 });
  }
}
