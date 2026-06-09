import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { supabase } from '@/lib/db';
import { JWT_SECRET } from '@/lib/auth';
import { buildInvitationMeta, normalizeBillingCycle, normalizeEngagementSource, normalizePaymentMode as normalizePaymentModeValue } from '@/lib/service-engagement';
import { getCompanyCAFromRequest } from '@/lib/server-company-ca-auth';
import { isCARequest } from '@/lib/server-ca-auth';

interface JWTPayload {
  id: number;
  user_type: string;
  email?: string;
  name?: string;
}

function safeNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    const { searchParams } = new URL(request.url);
    const role = String(searchParams.get('role') || 'inbox');

    let query = supabase
      .from('service_engagement_invitations')
      .select('*')
      .order('created_at', { ascending: false });

    if (role === 'sent') {
      query = query.eq('inviter_user_id', decoded.id);
    } else {
      query = query.eq('invitee_user_id', decoded.id);
    }

    const { data, error } = await query.limit(100);
    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error: any) {
    console.error('Fetch invitations error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to fetch invitations' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    const body = await request.json();

    const targetType = String(body?.targetType || body?.target_type || '').trim() as 'service_request' | 'service_offer' | 'csr_project';
    const targetId = String(body?.targetId || body?.target_id || '').trim();
    const inviteeUserId = safeNumber(body?.inviteeUserId ?? body?.invitee_user_id);
    const source = normalizeEngagementSource(body?.source || body?.invite_source || 'manual');
    const message = String(body?.message || '').trim() || null;
    const expiresAt = body?.expiresAt || body?.expires_at || null;

    if (!targetType || !targetId || !inviteeUserId) {
      return NextResponse.json({ error: 'targetType, targetId, and inviteeUserId are required' }, { status: 400 });
    }

    if (!['service_request', 'service_offer', 'csr_project'].includes(targetType)) {
      return NextResponse.json({ error: 'Invalid targetType' }, { status: 400 });
    }

    const meta = buildInvitationMeta({
      targetType,
      targetId,
      serviceOfferId: safeNumber(body?.serviceOfferId ?? body?.service_offer_id),
      serviceRequestId: safeNumber(body?.serviceRequestId ?? body?.service_request_id),
      csrProjectId: body?.csrProjectId ?? body?.csr_project_id ?? null,
      billingCycle: normalizeBillingCycle(body?.billingCycle ?? body?.billing_cycle),
      paymentMode: normalizePaymentModeValue(body?.paymentMode ?? body?.payment_mode, body?.billingCycle ?? body?.billing_cycle, targetType),
      validityDays: safeNumber(body?.validityDays ?? body?.validity_days),
      validUntil: expiresAt,
      attendanceMode: body?.attendanceMode ?? body?.attendance_mode ?? null,
      amount: safeNumber(body?.amount),
      ratePerUnit: safeNumber(body?.ratePerUnit ?? body?.rate_per_unit),
      currency: String(body?.currency || 'INR')
    });

    if (targetType === 'service_request') {
      const { data: requestRow } = await supabase
        .from('service_requests')
        .select('id, ngo_id')
        .eq('id', Number(targetId))
        .maybeSingle();

      if (!requestRow || Number(requestRow.ngo_id) !== Number(decoded.id)) {
        return NextResponse.json({ error: 'You can only invite for your own service requests' }, { status: 403 });
      }
    }

    if (targetType === 'service_offer') {
      const { data: offerRow } = await supabase
        .from('service_offers')
        .select('id, creator_id')
        .eq('id', Number(targetId))
        .maybeSingle();

      if (!offerRow || Number(offerRow.creator_id) !== Number(decoded.id)) {
        return NextResponse.json({ error: 'You can only invite for your own service offers' }, { status: 403 });
      }
    }

    if (targetType === 'csr_project') {
      const caContext = isCARequest(request) ? await getCompanyCAFromRequest(request) : null;
      const targetCompanyUserId = safeNumber(body?.companyUserId ?? body?.company_user_id);
      if (!caContext && decoded.user_type !== 'company') {
        return NextResponse.json({ error: 'Company CA or company authentication required for CSR invitations' }, { status: 403 });
      }
      if (caContext && targetCompanyUserId && Number(targetCompanyUserId) !== Number(caContext.identity.company_user_id)) {
        return NextResponse.json({ error: 'CSR invitation does not belong to the active company' }, { status: 403 });
      }
    }

    const invitationPayload = {
      target_type: targetType,
      target_id: targetId,
      inviter_user_id: decoded.id,
      invitee_user_id: inviteeUserId,
      source,
      message,
      status: 'pending',
      expires_at: meta.valid_until,
      meta
    };

    const { data, error } = await supabase
      .from('service_engagement_invitations')
      .insert(invitationPayload)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    await supabase.from('user_notifications').insert({
      user_id: inviteeUserId,
      type: 'service_invitation',
      title: 'New engagement invitation',
      message: message || `You have a new invitation for ${targetType.replace('_', ' ')}`,
      action_url: `/dashboard/invitations/${data.id}`
    });

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error: any) {
    console.error('Create invitation error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to create invitation' }, { status: 500 });
  }
}
