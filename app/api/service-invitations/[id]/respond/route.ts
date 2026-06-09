import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { supabase } from '@/lib/db';
import { JWT_SECRET } from '@/lib/auth';
import {
  buildAssignmentMeta,
  normalizeBillingCycle,
  normalizePaymentMode as normalizePaymentModeValue,
  normalizeEngagementSource
} from '@/lib/service-engagement';

interface JWTPayload {
  id: number;
  user_type: string;
  email?: string;
  name?: string;
}

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

async function createApplicationFromInvitation(invitation: any, userId: number) {
  const meta = safeJson(invitation.meta);
  const billingCycle = normalizeBillingCycle(meta.billing_cycle || meta.billingCycle);
  const paymentMode = normalizePaymentModeValue(meta.payment_mode || meta.paymentMode, billingCycle, meta.target_type || invitation.target_type);
  const source = normalizeEngagementSource(invitation.source);

  if (invitation.target_type === 'service_request') {
    const requestId = Number(meta.service_request_id || invitation.target_id);
    const payload = {
      service_request_id: requestId,
      volunteer_id: userId,
      application_message: invitation.message || '',
      status: 'pending',
      application_source: source,
      invited_by_user_id: invitation.inviter_user_id,
      invited_at: invitation.created_at,
      expires_at: invitation.expires_at,
      billing_cycle: billingCycle,
      payment_mode: paymentMode,
      attendance_mode: meta.attendance_mode || 'dashboard',
      daily_rate: meta.rate_per_unit || null,
      monthly_rate: billingCycle === 'monthly' ? meta.amount || meta.rate_per_unit || null : null,
      rate_currency: meta.currency || 'INR',
      assigned_until: meta.valid_until || invitation.expires_at || null,
      assignment_meta: meta,
      response_meta: {
        invitation_id: invitation.id,
        invite_source: source,
        accepted_via_invite: true,
        ...meta
      }
    };

    const { data, error } = await supabase.from('service_volunteers').insert(payload).select('*').single();
    if (error) throw error;
    return { table: 'service_volunteers', row: data };
  }

  if (invitation.target_type === 'service_offer') {
    const offerId = Number(meta.service_offer_id || invitation.target_id);
    const payload = {
      service_offer_id: offerId,
      client_id: userId,
      message: invitation.message || '',
      status: 'pending',
      application_source: source,
      invited_by_user_id: invitation.inviter_user_id,
      invited_at: invitation.created_at,
      expires_at: invitation.expires_at,
      billing_cycle: billingCycle,
      payment_mode: paymentMode,
      assigned_until: meta.valid_until || invitation.expires_at || null,
      assignment_meta: meta,
      response_meta: {
        invitation_id: invitation.id,
        invite_source: source,
        accepted_via_invite: true,
        ...meta
      }
    };

    const { data, error } = await supabase.from('service_clients').insert(payload).select('*').single();
    if (error) throw error;
    return { table: 'service_clients', row: data };
  }

  const targetCompanyUserId = toNumber(meta.company_user_id);
  const assignmentPayload = buildAssignmentMeta({
    targetType: 'csr_project',
    targetId: String(meta.csr_project_id || invitation.target_id),
    csrProjectId: String(meta.csr_project_id || invitation.target_id),
    invitationId: invitation.id,
    ownerUserId: targetCompanyUserId ?? invitation.inviter_user_id,
    assigneeUserId: userId,
    assignedByUserId: invitation.inviter_user_id,
    billingCycle,
    paymentMode,
    validUntil: meta.valid_until || invitation.expires_at || null,
    attendanceMode: 'pwa',
    amount: meta.amount || null,
    ratePerUnit: meta.rate_per_unit || null,
    currency: meta.currency || 'INR',
    applicationTable: null,
    applicationId: null
  });

  const { data, error } = await supabase
    .from('service_engagement_assignments')
    .insert({
      target_type: 'csr_project',
      target_id: String(meta.csr_project_id || invitation.target_id),
      invitation_id: invitation.id,
      application_table: null,
      application_id: null,
      owner_user_id: assignmentPayload.owner_user_id,
      assignee_user_id: userId,
      assigned_by_user_id: invitation.inviter_user_id,
      status: 'active',
      billing_cycle: billingCycle,
      payment_mode: paymentMode,
      valid_until: assignmentPayload.valid_until,
      rate_per_unit: meta.rate_per_unit || null,
      rate_currency: meta.currency || 'INR',
      meta: assignmentPayload
    })
    .select('*')
    .single();

  if (error) throw error;
  return { table: 'service_engagement_assignments', row: data };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    const { id } = await params;
    const invitationId = id;
    const body = await request.json();
    const action = String(body?.action || 'accept').toLowerCase();

    const { data: invitation, error: invitationError } = await supabase
      .from('service_engagement_invitations')
      .select('*')
      .eq('id', invitationId)
      .maybeSingle();

    if (invitationError || !invitation) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    }

    if (Number(invitation.invitee_user_id) !== Number(decoded.id)) {
      return NextResponse.json({ error: 'You can only respond to your own invitations' }, { status: 403 });
    }

    if (invitation.status !== 'pending') {
      return NextResponse.json({ error: 'Invitation already processed' }, { status: 400 });
    }

    if (action === 'reject') {
      await supabase
        .from('service_engagement_invitations')
        .update({ status: 'rejected', responded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', invitationId);

      return NextResponse.json({ success: true, data: { id: invitationId, status: 'rejected' } });
    }

    if (action !== 'accept') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const application = await createApplicationFromInvitation(invitation, decoded.id);

    await supabase
      .from('service_engagement_invitations')
      .update({ status: 'accepted', responded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', invitationId);

    await supabase.from('user_notifications').insert({
      user_id: invitation.inviter_user_id,
      type: 'service_invitation_accepted',
      title: 'Invitation accepted',
      message: `${decoded.name || 'A user'} accepted your invitation`,
      action_url: `/dashboard/engagements/${invitation.target_type}/${invitation.target_id}`
    });

    return NextResponse.json({ success: true, data: application }, { status: 201 });
  } catch (error: any) {
    console.error('Invitation response error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to respond to invitation' }, { status: 500 });
  }
}
