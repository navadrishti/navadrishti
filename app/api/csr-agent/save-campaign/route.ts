import { NextResponse } from "next/server";
import { insertCampaignDb, SelectedCampaignInSchema } from "@/lib/csr-agent/campaign";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const validated = SelectedCampaignInSchema.parse(body);

    const result = await insertCampaignDb(validated);
    return NextResponse.json(result, { status: 201 });
  }
  catch (error: any) {
    const message = error?.message || "Internal Server Error";
    const status =
        message.toLowerCase().includes("invalid") ||
        message.toLowerCase().includes("required")
        ? 400
        : 500;

    return NextResponse.json({ error: message }, { status });
    }
}