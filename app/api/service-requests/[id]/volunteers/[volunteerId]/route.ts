import { NextRequest, NextResponse } from 'next/server';
import { db, supabase } from '@/lib/db';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '@/lib/auth';

// Interface for JWT payload
interface JWTPayload {
  id: number;
  user_type: string;
  email: string;
  name: string;
}

function parseAmount(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const text = String(value).trim();
  if (!text) return 0;
  const parsed = Number(text.replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function getRequestTarget(request: any): { amount: number; quantity: number; type: string } {
  const requirements = (() => {
    try {
      return typeof request?.requirements === 'string' ? JSON.parse(request.requirements) : (request?.requirements || {});
    } catch {
      return {};
    }
  })();

  const requestType = String(requirements?.request_type || request?.request_type || request?.category || '').toLowerCase();
  return {
    type: requestType,
    amount: parseAmount(request?.target_amount ?? requirements?.funding_target_inr ?? requirements?.estimated_budget ?? requirements?.budget),
    quantity: parseAmount(request?.target_quantity ?? requirements?.target_quantity ?? request?.volunteers_needed ?? requirements?.beneficiary_count)
  };
}

// PUT - Update volunteer status
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; volunteerId: string }> }
) {
  try {
    const { id, volunteerId } = await params;
    
    // Get JWT token from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    const { id: userId, user_type: userType } = decoded;

    // NGOs can update applicants for their requests; individuals can mark their own accepted work as done
    if (userType !== 'ngo' && userType !== 'individual') {
      return NextResponse.json({ error: 'Only NGOs or individuals can update volunteer status' }, { status: 403 });
    }

    const requestId = parseInt(id);
    const volId = parseInt(volunteerId);
    const body = await request.json();
    const { status, decisionComment, allocationAmount, allocationQuantity, receiptUrl, completionNote } = body;

    // Validate status
    const validStatuses = ['pending', 'accepted', 'rejected', 'active', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    // First, verify that this request belongs to the authenticated NGO
    const request_data = await db.serviceRequests.getById(requestId);

    if (!request_data) {
      return NextResponse.json({ error: 'Service request not found' }, { status: 404 });
    }

    if (userType === 'ngo' && request_data.requester_id !== userId) {
      return NextResponse.json({ error: 'You can only update volunteers for your own requests' }, { status: 403 });
    }

    if (userType === 'individual' && volId !== userId) {
      return NextResponse.json({ error: 'You can only update your own application' }, { status: 403 });
    }

    // Find the volunteer application by its ID
    const { data: volunteerApplication, error } = await supabase
      .from('service_volunteers')
      .select('*')
      .eq('id', volId)
      .eq('service_request_id', requestId)
      .single();

    if (error || !volunteerApplication) {
      return NextResponse.json({ error: 'Volunteer not found for this request' }, { status: 404 });
    }

    const commentText = typeof decisionComment === 'string' ? decisionComment.trim() : '';
    if (commentText.length > 500) {
      return NextResponse.json({ error: 'Decision comment must be 500 characters or fewer' }, { status: 400 });
    }

    if (userType === 'ngo' && status === 'accepted') {
      const requestTarget = getRequestTarget(request_data);
      const allocation = requestTarget.type.includes('financial')
        ? parseAmount(allocationAmount || volunteerApplication.fulfillment_amount || volunteerApplication.assigned_amount)
        : parseAmount(allocationQuantity || volunteerApplication.fulfillment_quantity || volunteerApplication.assigned_quantity)

      if (allocation <= 0) {
        return NextResponse.json({ error: 'Allocation amount or quantity is required when accepting' }, { status: 400 });
      }

      const { data: allAssignments } = await supabase
        .from('service_volunteers')
        .select('id, status, assigned_amount, assigned_quantity')
        .eq('service_request_id', requestId)
        .in('status', ['accepted', 'active', 'completed'])

      const alreadyAllocated = (allAssignments || [])
        .filter((item: any) => Number(item.id) !== Number(volId))
        .reduce((sum: number, item: any) => {
          const amount = parseAmount(item.assigned_amount)
          const quantity = parseAmount(item.assigned_quantity)
          return sum + (requestTarget.type.includes('financial') ? amount : quantity)
        }, 0)

      const remaining = Math.max(0, (requestTarget.type.includes('financial') ? requestTarget.amount : requestTarget.quantity) - alreadyAllocated)
      if (allocation > remaining) {
        return NextResponse.json({ error: 'Allocation exceeds remaining need' }, { status: 400 })
      }
    }

    const existingMeta =
      volunteerApplication.response_meta && typeof volunteerApplication.response_meta === 'object'
        ? volunteerApplication.response_meta
        : {};

    const nextMeta = {
      ...existingMeta,
      ngo_decision_comment: status === 'rejected' ? commentText : null,
      ngo_decision_at: new Date().toISOString()
    };

    const updatePayload: Record<string, any> = {
      status,
      response_meta: nextMeta,
      updated_at: new Date().toISOString()
    }

    if (userType === 'ngo' && status === 'accepted') {
      updatePayload.assigned_amount = allocationAmount != null ? Number(allocationAmount) : parseAmount(volunteerApplication.fulfillment_amount || volunteerApplication.assigned_amount)
      updatePayload.assigned_quantity = allocationQuantity != null ? Number(allocationQuantity) : parseAmount(volunteerApplication.fulfillment_quantity || volunteerApplication.assigned_quantity)
      updatePayload.fulfilled_amount = volunteerApplication.fulfilled_amount || 0
      updatePayload.fulfilled_quantity = volunteerApplication.fulfilled_quantity || 0
    }

    if (userType === 'individual' && status === 'completed') {
      updatePayload.individual_done_at = new Date().toISOString()
      updatePayload.individual_receipt_url = receiptUrl || volunteerApplication.individual_receipt_url || null
      updatePayload.completion_note = completionNote || volunteerApplication.completion_note || null
      updatePayload.status = 'active'
    }

    if (userType === 'ngo' && status === 'completed') {
      updatePayload.ngo_confirmed_at = new Date().toISOString()
      updatePayload.ngo_receipt_url = receiptUrl || volunteerApplication.ngo_receipt_url || null
      updatePayload.completion_note = completionNote || volunteerApplication.completion_note || null
    }

    const { data: updatedVolunteer, error: updateError } = await supabase
      .from('service_volunteers')
      .update(updatePayload)
      .eq('id', volId)
      .eq('service_request_id', requestId)
      .select('*')
      .single();

    if (updateError || !updatedVolunteer) {
      return NextResponse.json({ error: 'Failed to update volunteer status' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: updatedVolunteer
    });

  } catch (error) {
    console.error('Error updating volunteer status:', error);
    return NextResponse.json(
      { error: 'Failed to update volunteer status' },
      { status: 500 }
    );
  }
}