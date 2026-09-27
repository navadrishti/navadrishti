import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  attachCsrCapabilityAfterPayment,
  createCsrCapabilityRentalOrder,
  getCampaignStatus,
  updateCampaignDb,
  UpdateSelectedCampaignSchema
} from "@/lib/csr-agent/campaign";
import { parseLeadNgoInvites } from "@/lib/campaign-volunteer-attendance";
import { assertUserType, getAuthUserFromRequest } from "@/lib/server-auth";
import { getErrorMessage, parseJsonObject } from "@/lib/utils";

function safeSignatureMatch(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(String(expected || ''), 'utf8');
  const receivedBuffer = Buffer.from(String(received || ''), 'utf8');
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

function authenticatedCompanyId(req: NextRequest): number | null {
  try {
    const user = getAuthUserFromRequest(req);
    assertUserType(user, ['company']);
    return Number(user.id);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const companyId = authenticatedCompanyId(req);
  if (!companyId) {
    return NextResponse.json({ error: 'Company authentication required' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const action = String(body?.action || '').trim();
    const campaignId = String(body?.campaign_id || '').trim();
    const offerId = Number(body?.offer_id || 0);

    if (!campaignId) {
      return NextResponse.json({ error: 'campaign_id is required' }, { status: 400 });
    }
    if (!Number.isFinite(offerId) || offerId <= 0) {
      return NextResponse.json({ error: 'offer_id is required' }, { status: 400 });
    }

    if (action === 'capability_rental_create_order') {
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
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
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

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error) {
    const message = getErrorMessage(error) || 'Internal Server Error';
    const status =
      message.toLowerCase().includes('not found') ? 404 :
      message.toLowerCase().includes('lead ngo') ? 409 :
      message.toLowerCase().includes('invalid') ? 400 :
      500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(req: NextRequest) {
  const authCompanyId = authenticatedCompanyId(req);
  if (!authCompanyId) {
    return NextResponse.json({ error: 'Company authentication required' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { campaign, company_id, campaign_id } = UpdateSelectedCampaignSchema.parse(body);
    if (Number(company_id) !== authCompanyId) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

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
        .select("end_date, impact_metrics, lead_ngo_user_id")
        .eq("id", campaign_id)
        .eq("company_id", company_id)
        .maybeSingle();
      const impact = parseJsonObject(existing?.impact_metrics);
      const leadNgoId = Number(existing?.lead_ngo_user_id || 0);
      const pendingInviteIds = parseLeadNgoInvites(impact.lead_ngo_invites).map((invite) => invite.ngo_id);

      if (leadNgoId > 0) {
        const coverageGate = await assertNgoCsr1CoversWork(leadNgoId, campaign.end_date);
        if (!coverageGate.ok) {
          return NextResponse.json({ error: coverageGate.error }, { status: 403 });
        }
      } else if (pendingInviteIds.length > 0) {
        for (const ngoId of [...new Set(pendingInviteIds)]) {
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

  } catch (error) {
    const message = getErrorMessage(error) || "Internal Server Error";

    const status =
        message.toLowerCase().includes("not found") ? 404 :
        message.toLowerCase().includes("active") ? 403 : // Guard check fail
        message.toLowerCase().includes("invalid") ? 400 :
        500;

    return NextResponse.json({ error: message }, { status });
  }
}