import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { embedText } from "@/lib/embed";
import { generateText } from "@/lib/openrouter";

const WEIGHTS = {
  cause_alignment:    0.35,
  geography:          0.25,
  impact_score:       0.15,
  expertise_match:    0.15,
  verification_score: 0.10,
};

const METRO_GROUPS: Record<string, string[]> = {
  mumbai:    ["mumbai", "thane", "navi mumbai", "pune", "maharashtra"],
  delhi:     ["delhi", "new delhi", "noida", "gurgaon", "faridabad", "ghaziabad", "delhi ncr"],
  bangalore: ["bangalore", "bengaluru", "mysore", "karnataka"],
  chennai:   ["chennai", "coimbatore", "tamil nadu"],
  hyderabad: ["hyderabad", "secunderabad", "telangana"],
  kolkata:   ["kolkata", "howrah", "west bengal"],
};

const STATE_ALIASES: Record<string, string> = {
  maharashta: "maharashtra", maharashtra: "maharashtra",
  delhi: "delhi", karnataka: "karnataka",
};

const n = (t: string) => (t ?? "").trim().toLowerCase();

// Dummy profiles — remove when sector/expertise fields are populated in DB
const DUMMY_PROFILES: Record<string, { cause_tags: string[]; expertise: string[]; past_projects_count: number }> = {
  "Hope Foundation NGO": {
    cause_tags:          ["Education", "Women Empowerment", "Digital Literacy", "Healthcare"],
    expertise:           ["Skill Training", "Rural Development", "Youth Programs", "Community Health"],
    past_projects_count: 12,
  },
};

function geographyScore(campaignRegion: string, city: string, state: string): number {
  const cr = n(campaignRegion);
  const nc = n(city);
  const ns = STATE_ALIASES[n(state)] ?? n(state);
  if (!cr) return 0.3;
  if (["pan india", "all india", "india"].includes(cr)) return 0.6;
  if (cr === nc || cr.includes(nc) || nc.includes(cr)) return 1.0;
  for (const group of Object.values(METRO_GROUPS)) {
    const inGroup = (s: string) => group.some(g => s.includes(g) || g.includes(s));
    if (inGroup(cr) && inGroup(nc)) return 0.8;
  }
  if (ns && (ns.includes(cr) || cr.includes(ns))) return 0.6;
  return 0.1;
}

function causeAlignmentScore(cause: string, tags: string[]): number {
  if (!tags?.length) return 0;
  const words = new Set(n(cause).split(" "));
  const matched = tags.filter(tag =>
    n(tag).split(" ").some(w => words.has(w)) || Array.from(words).some(w => n(tag).includes(w))
  ).length;
  return Math.min(matched / tags.length, 1.0);
}

function expertiseMatchScore(campaign: Record<string, unknown>, expertise: string[]): number {
  if (!expertise?.length) return 0;
  const text = n([campaign.cause, campaign.schedule_vii, campaign.title].filter(Boolean).join(" "));
  const matched = expertise.filter(s => n(s).split(" ").some(w => text.includes(w))).length;
  return Math.min(matched / expertise.length, 1.0);
}

function impactScore(count: number): number {
  return Math.min(count / 20, 1.0);
}

function verificationScore(ngo: Record<string, unknown>): number {
  // verified=0.4, registration_number=0.3, registration_type=0.1, fcra_number=0.2
  let score = 0.4;
  if (ngo.registration_number) score += 0.3;
  if (ngo.registration_type)   score += 0.1;
  if (ngo.fcra_number)         score += 0.2;
  return Math.min(score, 1.0);
}

async function generateMatchReason(
  campaign: Record<string, unknown>,
  ngo: Record<string, unknown>,
  signals: Record<string, number>
): Promise<string> {
  const prompt = `Write one sentence explaining why this NGO matches this CSR campaign.
Be specific. Use only the data given. No invented details.

Campaign: ${campaign.title}, Cause: ${campaign.cause}, Region: ${campaign.region}
NGO: ${ngo.ngo_name}, City: ${ngo.city} ${ngo.state_province}, FCRA: ${ngo.fcra_number ? "Yes" : "No"}
Scores — Cause: ${signals.cause_alignment.toFixed(2)}, Geo: ${signals.geography.toFixed(2)}, Impact: ${signals.impact_score.toFixed(2)}, Expertise: ${signals.expertise_match.toFixed(2)}, Verification: ${signals.verification_score.toFixed(2)}

Return ONLY one sentence. No quotes. End with a period.`;

  try {
    return (await generateText(prompt)).trim();
  } catch {
    const top = Object.entries(signals).sort((a, b) => b[1] - a[1])[0][0];
    const labels: Record<string, string> = {
      cause_alignment:    `strong alignment with ${campaign.cause} cause`,
      geography:          `regional presence in ${ngo.city}`,
      impact_score:       "strong past project track record",
      expertise_match:    "relevant expertise for this campaign type",
      verification_score: "fully verified with FCRA compliance",
    };
    return `${ngo.ngo_name} was matched due to ${labels[top]} with the ${campaign.title} campaign.`;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { campaign, top_n = 5 } = body;

    if (!campaign)
      return NextResponse.json({ error: "campaign is required." }, { status: 400 });

    const supabase      = createServerClient();
    const campaignRegion = campaign.region ?? "";
    const campaignCause  = campaign.cause  ?? "";

    // Step 1 — embed campaign for similarity search
    const embedInput = [campaign.title, `Cause: ${campaignCause}`, `Region: ${campaignRegion}`].join(". ");
    const embedding  = await embedText(embedInput);

    // Step 2 — call match_ngo_service (already filters source = ngo_request internally)
    const { data: matches, error: matchError } = await supabase.rpc("match_ngo_service", {
      query_embedding: embedding,
      match_count:     top_n * 4,
    });

    if (matchError) throw matchError;
    if (!matches?.length) return NextResponse.json({ matches: [] });

    // Step 3 — fetch NGO verification + user data for scoring
    const ngoIds = matches.map((m: { entity_id: string }) => m.entity_id);

    const [{ data: ngoData, error: ngoError }, { data: userData, error: userError }] = await Promise.all([
      supabase.from("ngo_verifications")
        .select("user_id, ngo_name, sector, verification_status, registration_number, registration_type, fcra_number")
        .eq("verification_status", "verified")
        .in("user_id", ngoIds),
      supabase.from("users")
        .select("id, city, state_province")
        .in("id", ngoIds),
    ]);

    if (ngoError)  throw ngoError;
    if (userError) throw userError;

    const ngoMap  = Object.fromEntries((ngoData  ?? []).map(n => [n.user_id, n]));
    const userMap = Object.fromEntries((userData ?? []).map(u => [u.id, u]));

    // Step 4 — score each match on all 5 signals
    const scored = matches
      .filter((m: { entity_id: string }) => ngoMap[m.entity_id])
      .map((m: { entity_id: string; similarity: number }) => {
        const ngo    = ngoMap[m.entity_id];
        const user   = userMap[m.entity_id] ?? {};
        const dummy  = DUMMY_PROFILES[ngo.ngo_name] ?? {};
        const tags   = dummy.cause_tags ?? (ngo.sector ? [ngo.sector] : []);
        const expert = dummy.expertise  ?? [];

        const signals = {
          cause_alignment:    m.similarity,
          geography:          geographyScore(campaignRegion, user.city ?? "", user.state_province ?? ""),
          impact_score:       impactScore(dummy.past_projects_count ?? 0),
          expertise_match:    expertiseMatchScore(campaign, expert),
          verification_score: verificationScore(ngo),
        };

        const composite = Object.entries(signals).reduce(
          (sum, [key, val]) => sum + val * WEIGHTS[key as keyof typeof WEIGHTS], 0
        );

        return { ngo, user, signals, composite };
      });

    scored.sort((a: { composite: number }, b: { composite: number }) => b.composite - a.composite);

    // Step 5 — generate match reasons in parallel
    const results = await Promise.all(
      scored.slice(0, top_n).map(async (item: {
        ngo: Record<string, unknown>;
        user: Record<string, unknown>;
        signals: Record<string, number>;
        composite: number;
      }) => {
        const matchReason = await generateMatchReason(campaign, { ...item.ngo, ...item.user }, item.signals);
        return {
          ngo_id:              item.ngo.user_id,
          ngo_name:            item.ngo.ngo_name,
          city:                item.user.city,
          state_province:      item.user.state_province,
          registration_type:   item.ngo.registration_type,
          fcra_verified:       Boolean(item.ngo.fcra_number),
          verification_status: item.ngo.verification_status,
          composite_score:     parseFloat(item.composite.toFixed(4)),
          signal_breakdown: {
            cause_alignment:    parseFloat(item.signals.cause_alignment.toFixed(4)),
            geography:          parseFloat(item.signals.geography.toFixed(4)),
            impact_score:       parseFloat(item.signals.impact_score.toFixed(4)),
            expertise_match:    parseFloat(item.signals.expertise_match.toFixed(4)),
            verification_score: parseFloat(item.signals.verification_score.toFixed(4)),
          },
          match_reason: matchReason,
        };
      })
    );

    return NextResponse.json({ matches: results });

  } catch (err) {
    console.error("[ngo-matching]", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}