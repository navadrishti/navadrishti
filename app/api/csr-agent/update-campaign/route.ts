import { NextResponse } from "next/server";
import crypto from "crypto";
import { 
  attachCsrCapabilityAfterPayment,
  createCsrCapabilityRentalOrder,
  getCampaignStatus, 
  linkCsrCapabilityRentalTracking,
  syncCsrCapabilityRentalDelhivery,
  updateCampaignDb,
  UpdateSelectedCampaignSchema 
} from "@/lib/csr-agent/campaign";

function safeSignatureMatch(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(String(expected || ''), 'utf8');
  const receivedBuffer = Buffer.from(String(received || ''), 'utf8');
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const action = String(body?.action || '').trim();
    const campaignId = String(body?.campaign_id || '').trim();
    const companyId = Number(body?.company_id || 0);
    const offerId = Number(body?.offer_id || 0);

    if (!campaignId || !Number.isFinite(companyId) || companyId <= 0) {
      return NextResponse.json({ error: 'campaign_id and company_id are required' }, { status: 400 });
    }

    if (action === 'capability_rental_create_order') {
      if (!Number.isFinite(offerId) || offerId <= 0) {
        return NextResponse.json({ error: 'offer_id is required' }, { status: 400 });
      }
      const result = await createCsrCapabilityRentalOrder({ campaignId, companyId, offerId });
      return NextResponse.json({ success: true, data: result });
    }

    if (action === 'capability_rental_verify') {
      const keySecret = process.env.RAZORPAY_KEY_SECRET;
      if (!keySecret) {
        return NextResponse.json({ error: 'Razorpay is not configured' }, { status: 500 });
      }
      const razorpay_order_id = String(body?.razorpay_order_id || '').trim();
      const razorpay_payment_id = String(body?.razorpay_payment_id || '').trim();
      const razorpay_signature = String(body?.razorpay_signature || '').trim();
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !offerId) {
        return NextResponse.json({ error: 'Missing payment verification fields' }, { status: 400 });
      }
      const expected = crypto
        .createHmac('sha256', keySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');
      if (!safeSignatureMatch(expected, razorpay_signature)) {
        return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 });
      }
      const rental = await attachCsrCapabilityAfterPayment({
        campaignId,
        companyId,
        offerId,
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
      });
      return NextResponse.json({ success: true, data: { rental } });
    }

    if (action === 'capability_rental_retry_booking') {
      const leg = String(body?.leg || 'outbound').trim() as 'outbound' | 'return';
      const bookedByUserId = Number(body?.booked_by_user_id || body?.user_id || 0);
      if (!Number.isFinite(offerId) || offerId <= 0) {
        return NextResponse.json({ error: 'offer_id is required' }, { status: 400 });
      }
      if (!Number.isFinite(bookedByUserId) || bookedByUserId <= 0) {
        return NextResponse.json({ error: 'booked_by_user_id is required' }, { status: 400 });
      }
      const { retryCsrCapabilityDelhiveryBooking } = await import('@/lib/csr-agent/campaign');
      const rental = await retryCsrCapabilityDelhiveryBooking({
        campaignId,
        offerId,
        leg,
        bookedByUserId,
      });
      return NextResponse.json({ success: true, data: { rental } });
    }

    if (action === 'capability_rental_link_tracking') {
      const leg = String(body?.leg || 'outbound').trim() as 'outbound' | 'return';
      const trackingId = String(body?.tracking_id || body?.trackingId || '').trim();
      if (!Number.isFinite(offerId) || offerId <= 0) {
        return NextResponse.json({ error: 'offer_id is required' }, { status: 400 });
      }
      const rental = await linkCsrCapabilityRentalTracking({
        campaignId,
        offerId,
        leg,
        trackingId,
      });
      return NextResponse.json({ success: true, data: { rental } });
    }

    if (action === 'capability_rental_sync_delivery') {
      const leg = String(body?.leg || 'outbound').trim() as 'outbound' | 'return';
      const trackingId = String(body?.tracking_id || body?.trackingId || '').trim();
      if (!Number.isFinite(offerId) || offerId <= 0) {
        return NextResponse.json({ error: 'offer_id is required' }, { status: 400 });
      }
      const rental = await syncCsrCapabilityRentalDelhivery({
        campaignId,
        offerId,
        leg,
        trackingId: trackingId || undefined,
      });
      return NextResponse.json({ success: true, data: { rental } });
    }

    if (action === 'capability_rental_dispatch') {
      const dispatchType = String(body?.dispatch_type || '').trim();
      const leg = dispatchType === 'return_delivered' ? 'return' : 'outbound';
      if (!Number.isFinite(offerId) || offerId <= 0) {
        return NextResponse.json({ error: 'offer_id is required' }, { status: 400 });
      }
      const rental = await syncCsrCapabilityRentalDelhivery({
        campaignId,
        offerId,
        leg,
        trackingId: String(body?.tracking_id || body?.trackingId || '').trim() || undefined,
      });
      return NextResponse.json({ success: true, data: { rental } });
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error: any) {
    const message = error?.message || 'Internal Server Error';
    const status =
      message.toLowerCase().includes('not found') ? 404 :
      message.toLowerCase().includes('invalid') ? 400 :
      500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { campaign, company_id, campaign_id } = UpdateSelectedCampaignSchema.parse(body);

    if (!campaign || Object.keys(campaign).length === 0) {
      return NextResponse.json({ error: "No update fields provided" }, { status: 400 });
    }

    const currentStatus = await getCampaignStatus(campaign_id, company_id);
    
    if (!currentStatus) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    if (currentStatus === "active") {
      return NextResponse.json(
        { error: "Cannot update an active campaign" }, 
        { status: 403 }
      );
    }

    if (campaign.end_date) {
      const { supabase } = await import("@/lib/db");
      const { assertNgoCsr1CoversWork } = await import("@/lib/server-auth");
      const { data: existing } = await supabase
        .from("campaigns")
        .select("end_date, impact_metrics")
        .eq("id", campaign_id)
        .eq("company_id", company_id)
        .maybeSingle();
      const impact =
        existing?.impact_metrics && typeof existing.impact_metrics === "object"
          ? existing.impact_metrics
          : {};
      const leadNgoId = Number(impact.selected_lead_ngo_id || 0);
      const invites = Array.isArray(impact.lead_ngo_invites) ? impact.lead_ngo_invites : [];
      const pendingInviteIds = invites
        .map((invite: any) => Number(invite?.ngo_id || invite?.ngoId || 0))
        .filter((id: number) => Number.isFinite(id) && id > 0);

      if (leadNgoId > 0) {
        const coverageGate = await assertNgoCsr1CoversWork(leadNgoId, campaign.end_date);
        if (!coverageGate.ok) {
          return NextResponse.json({ error: coverageGate.error }, { status: 403 });
        }
      } else if (pendingInviteIds.length > 0) {
        for (const ngoId of [...new Set(pendingInviteIds as number[])]) {
          const coverageGate = await assertNgoCsr1CoversWork(ngoId, campaign.end_date);
          if (!coverageGate.ok) {
            return NextResponse.json(
              {
                error:
                  coverageGate.error ||
                  "CSR-1 must cover the updated campaign end date for every invited lead NGO.",
              },
              { status: 403 }
            );
          }
        }
      }
    }

    // Passes strictly typed 'campaign' object to the service
    const result = await updateCampaignDb(campaign_id, company_id, campaign);
    return NextResponse.json(result);

  } catch (error: any) {
    const message = error?.message || "Internal Server Error";

    // Map business logic and validation errors to correct HTTP codes
    const status =
        message.toLowerCase().includes("not found") ? 404 :
        message.toLowerCase().includes("active") ? 403 : // Guard check fail
        message.toLowerCase().includes("invalid") ? 400 :
        500;

    return NextResponse.json({ error: message }, { status });
  }
}