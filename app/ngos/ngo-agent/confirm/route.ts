import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db";
import { randomUUID } from "crypto";

function buildEmbedText(s: Record<string, unknown>): string {
  return [
    s.title,
    s.description,
    `Category: ${s.category}`,
    `Location: ${s.location}`,
    `Type: ${s.request_type}`,
    `Impact: ${s.impact_description}`,
  ].join(". ");
}

async function embedText(text: string, supabase: ReturnType<typeof createServerClient>): Promise<number[]> {
  const { data, error } = await supabase.functions.invoke("embed", {
    body: { input: text },
  });
  if (error) throw new Error(`Embedding failed: ${error.message}`);
  return data.embedding as number[];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ngo_id, structured } = body;

    if (!ngo_id)     return NextResponse.json({ error: "ngo_id is required." }, { status: 400 });
    if (!structured) return NextResponse.json({ error: "structured data is required." }, { status: 400 });

    const supabase = createServerClient();

    // Save to service_requests table
    const { data: requestData, error: requestError } = await supabase
      .from("service_requests")
      .insert({
        ngo_id,
        title:              structured.title,
        description:        structured.description,
        category:           structured.category,
        location:           structured.location,
        request_type:       structured.request_type,
        estimated_budget:   structured.estimated_budget,
        budget_currency:    structured.budget_currency ?? "INR",
        beneficiary_count:  structured.beneficiary_count,
        impact_description: structured.impact_description,
        urgency_level:      structured.urgency_level,
        deadline:           structured.required_by_date ?? null,
        timeline:           structured.timeline ?? null,
        requirements:       structured.requirements ?? {},
        tags:               structured.tags ?? [],
        status:             "active",
      })
      .select("id")
      .single();

    if (requestError) throw requestError;

    const requestId = requestData.id;

    // Embed best-effort: entity_id is uuid, version is integer (schema).
    // Do not fail the need create if embeddings insert is rejected (e.g. source enum).
    try {
      const embedInput = buildEmbedText(structured);
      const embedding = await embedText(embedInput, supabase);
      const { error: embedError } = await supabase.from("embeddings").insert({
        entity_id: randomUUID(),
        embedding,
        source: "service_request",
        version: 1,
        metadata: {
          request_id: requestId,
          ngo_id,
          title: structured.title,
          category: structured.category,
          location: structured.location,
          request_type: structured.request_type,
          estimated_budget: structured.estimated_budget,
          budget_currency: structured.budget_currency ?? "INR",
        },
      });
      if (embedError) {
        console.error("[ngos/ngo-agent/confirm] embedding insert failed:", embedError);
      }
    } catch (embedErr) {
      console.error("[ngos/ngo-agent/confirm] embedding skipped:", embedErr);
    }

    return NextResponse.json({
      status: "saved",
      request_id: requestId,
      message: "Request saved successfully.",
    });
  } catch (err) {
    console.error("[ngos/ngo-agent/confirm]", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
