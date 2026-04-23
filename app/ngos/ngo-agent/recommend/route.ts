import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { GeminiChat } from "@/lib/geminiClient";

const SIMILARITY_THRESHOLD = 0.72;

const n = (t: string) => (t ?? "").trim().toLowerCase();

function categoryOverlap(a: string, b: string): boolean {
  if (!a || !b) return false;
  return n(a) === n(b) || n(a).includes(n(b)) || n(b).includes(n(a));
}

function locationOverlap(reqLocation: string, city: string, state: string, coverage: string): boolean {
  const rl = n(reqLocation);
  if (n(coverage).includes("pan india") || n(coverage).includes("all india")) return true;
  if (n(city)     && (rl.includes(n(city))     || n(city).includes(rl)))     return true;
  if (n(state)    && (rl.includes(n(state))    || n(state).includes(rl)))    return true;
  if (n(coverage) && (rl.includes(n(coverage)) || n(coverage).includes(rl))) return true;
  return false;
}

function budgetCompatible(reqBudget: number, price: number | null, priceType: string | null): boolean {
  if (!price || priceType === "free" || priceType === "volunteer") return true;
  return price <= reqBudget;
}

async function embedText(text: string, supabase: ReturnType<typeof createServerClient>): Promise<number[]> {
  const { data, error } = await supabase.functions.invoke("embed", {
    body: { input: text },
  });
  if (error) throw new Error(`Embedding failed: ${error.message}`);
  return data.embedding as number[];
}

async function getRecommendationReason(
  request: Record<string, unknown>,
  offers: Record<string, unknown>[],
  shouldList: boolean
): Promise<string> {
  const summary = offers.slice(0, 3)
    .map(o => `- ${o.title} (${o.category}, ${o.city ?? o.state_province ?? "Unknown"})`)
    .join("\n");

  const prompt = shouldList
    ? `An NGO needs: "${request.title}" in ${request.location} under ${request.category}. No matching service offers were found. Write one sentence explaining why this should be listed publicly. End with a period.`
    : `An NGO needs: "${request.title}" in ${request.location} under ${request.category}. These offers may fulfill it:\n${summary}\nWrite one sentence explaining why this may not need public listing yet. End with a period.`;

  try {
    return (await GeminiChat([{ role: "user", content: prompt }])).trim();
  } catch {
    return shouldList
      ? "No matching service offers found — listing publicly to attract new providers."
      : `${offers.length} existing service offer(s) found that may fulfill this request.`;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { structured } = body;

    if (!structured)
      return NextResponse.json({ error: "structured request data is required." }, { status: 400 });

    const { category, location, estimated_budget, title, description } = structured;
    const supabase = createServerClient();

    // Step 1 — embed the request
    const embedInput = [title, description, `Category: ${category}`, `Location: ${location}`].join(". ");
    const embedding  = await embedText(embedInput, supabase);

    // Step 2 — vector search against service_offer embeddings
    const { data: vectorMatches } = await supabase.rpc("match_ngo_service", {
      query_embedding: embedding,
      match_count:     20,
    });

    const strongVector = (vectorMatches ?? [])
      .filter((m: { similarity: number; source: string }) =>
        m.similarity >= SIMILARITY_THRESHOLD && m.source === "service_offer"
      );

    // Step 3 — direct DB filter on service_offers
    const { data: directMatches, error: directError } = await supabase
      .from("service_offers")
      .select(`
        id, title, description, category, category_focus,
        offer_type, city, state_province, coverage_area,
        status, admin_status, capacity_limit,
        price_type, price_amount
      `)
      .eq("status", "active")
      .eq("admin_status", "approved");

    if (directError) throw directError;

    const vectorIds = new Set(strongVector.map((m: { entity_id: string }) => String(m.entity_id)));

    const filteredDirect = (directMatches ?? [])
      .filter(o =>
        !vectorIds.has(String(o.id)) &&
        categoryOverlap(category, o.category ?? o.category_focus) &&
        locationOverlap(location, o.city, o.state_province, o.coverage_area) &&
        budgetCompatible(estimated_budget, o.price_amount, o.price_type)
      )
      .slice(0, 5);

    const allMatches = [
      ...strongVector.map((m: { entity_id: string; similarity: number; metadata: Record<string, unknown> }) => ({
        ...m.metadata,
        entity_id:  m.entity_id,
        similarity: parseFloat(m.similarity.toFixed(4)),
        source:     "vector",
      })),
      ...filteredDirect.map(o => ({ ...o, source: "filter" })),
    ];

    const shouldList = allMatches.length === 0;
    const reason     = await getRecommendationReason(structured, allMatches, shouldList);

    return NextResponse.json({
      should_list:    shouldList,
      match_count:    allMatches.length,
      matches:        allMatches.slice(0, 5),
      reason,
      recommendation: shouldList
        ? "LIST — No existing offers found. Listing will attract new service providers."
        : `DO NOT LIST YET — ${allMatches.length} existing offer(s) may fulfill this request. Review matches first.`,
    });

  } catch (err) {
    console.error("[ngos/ngo-agent/recommend]", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}