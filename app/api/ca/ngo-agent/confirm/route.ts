import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { embedText } from "@/lib/embed";

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
        status:             "open",
      })
      .select("id")
      .single();

    if (requestError) throw requestError;

    const requestId = requestData.id;

    // Generate embedding using Supabase edge function
    const embedInput = buildEmbedText(structured);
    const embedding  = await embedText(embedInput);

    // Store in embeddings table
    // entity_id = ngo_id, source = ngo_request, version = ngo_request
    // location + estimated_budget in metadata for pre-filtering before vector search
    const { error: embedError } = await supabase
      .from("embeddings")
      .insert({
        entity_id: ngo_id,
        embedding,
        source:    "ngo_request",
        version:   "ngo_request",
        metadata: {
          request_id:       requestId,
          title:            structured.title,
          category:         structured.category,
          location:         structured.location,
          request_type:     structured.request_type,
          estimated_budget: structured.estimated_budget,
          budget_currency:  structured.budget_currency ?? "INR",
        },
      });

    if (embedError) throw embedError;

    return NextResponse.json({
      status:     "saved",
      request_id: requestId,
      message:    "Request saved and embedded into RAG successfully.",
    });

  } catch (err) {
    console.error("[ngo-agent/confirm]", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}