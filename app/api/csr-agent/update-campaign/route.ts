import { NextResponse } from "next/server";
import { 
  getCampaignStatus, 
  updateCampaignDb, 
  UpdateSelectedCampaignSchema 
} from "@/lib/csr-agent/campaign";

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