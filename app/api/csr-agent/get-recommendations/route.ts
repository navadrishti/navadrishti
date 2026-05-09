import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/db";
import {
  findServiceOffers,
  InputSchema,
  type CapabilityMatch,
} from "@/lib/csr-agent/find-service-offers";

type RecommendationDebug = {
  reason: "coercion_validation_failed" | "input_validation_failed" | "matcher_error" | "fallback_ok" | "empty_results" | "ok" | "route_error";
  message?: string;
  details?: unknown;
};

type RecommendationResponse =
  | { success: true; data: CapabilityMatch[]; debug?: RecommendationDebug }
  | { success: false; error: string; details?: unknown; debug?: RecommendationDebug };

const isDev = process.env.NODE_ENV !== "production";

const RequestCoercionSchema = z
  .object({
    title: z.coerce.string().trim().min(1),
    description: z.coerce.string().trim().min(1),
    category: z.coerce.string().trim().min(1),
    city: z.coerce.string().trim().default(""),
    state_province: z.coerce.string().trim().default(""),
    budget: z.coerce.number(),
    start_date: z.coerce.date(),
    end_date: z.coerce.date(),
    requirementDetails: z.coerce.string().trim().min(1),
  })
  .refine((data) => Number.isFinite(data.budget) && data.budget > 0, {
    message: "budget must be a positive number",
    path: ["budget"],
  })
  .refine((data) => data.start_date < data.end_date, {
    message: "start_date must be before end_date",
    path: ["end_date"],
  });

type OfferFallbackRow = {
  id: number;
  title: string | null;
  description: string | null;
  offer_type: string | null;
  transaction_type: string | null;
  impact_area: unknown;
  city: string | null;
  state_province: string | null;
  price_amount: number | string | null;
  price_type: string | null;
  tags: unknown;
  requirements: unknown;
};

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const tokenize = (value: string): string[] =>
  value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2);

const valueToText = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((entry) => valueToText(entry)).filter(Boolean).join(", ");
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return String(value);
};

const parseListText = (value: unknown): string[] => {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value
      .map((entry) => valueToText(entry).trim())
      .filter(Boolean);
  }

  const text = valueToText(value);
  if (!text) return [];

  return text
    .split(/[;,|]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const scoreFallbackOffer = (offer: OfferFallbackRow, input: z.infer<typeof RequestCoercionSchema>): number => {
  let score = 25;
  const queryTokens = new Set(tokenize(`${input.title} ${input.description} ${input.requirementDetails} ${input.category}`));
  const impactAreaText = valueToText(offer.impact_area);
  const tagsText = valueToText(offer.tags);
  const requirementsText = valueToText(offer.requirements);
  const haystack = `${offer.title || ""} ${offer.description || ""} ${impactAreaText} ${tagsText} ${requirementsText}`.toLowerCase();

  let hits = 0;
  for (const token of queryTokens) {
    if (haystack.includes(token)) hits += 1;
  }

  if (queryTokens.size > 0) {
    score += Math.min(35, Math.round((hits / queryTokens.size) * 35));
  }

  const categoryMatch = impactAreaText.toLowerCase().includes(input.category.toLowerCase());
  if (categoryMatch) score += 20;

  if (offer.city && input.city && offer.city.toLowerCase() === input.city.toLowerCase()) score += 10;
  else if (offer.state_province && input.state_province && offer.state_province.toLowerCase() === input.state_province.toLowerCase()) score += 6;

  const price = toNumber(offer.price_amount);
  if ((offer.price_type || "").toLowerCase() === "free" || price === 0) score += 10;
  else if ((offer.price_type || "").toLowerCase() === "negotiable") score += 6;
  else if (price <= input.budget) score += 8;

  return Math.max(1, Math.min(100, score));
};

const buildFallbackMatches = (offers: OfferFallbackRow[], input: z.infer<typeof RequestCoercionSchema>): CapabilityMatch[] => {
  return offers
    .map((offer, index) => {
      const score = scoreFallbackOffer(offer, input);
      const similarity = Math.min(0.95, Math.max(0.2, score / 100));

      return {
        capability_id: -1 * (offer.id + index),
        capability_name: (offer.title || "Capability Offer").trim(),
        similarity,
        service_offer_id: offer.id,
        offer_type: offer.offer_type || "unknown",
        transaction_type: offer.transaction_type || "unknown",
        impact_area: parseListText(offer.impact_area),
        city: offer.city || "",
        state_province: offer.state_province || "",
        price_amount: toNumber(offer.price_amount),
        price_type: offer.price_type || "unknown",
        score,
      };
    })
    .sort((a, b) => b.score - a.score);
};

const findServiceOffersFallback = async (input: z.infer<typeof RequestCoercionSchema>): Promise<CapabilityMatch[]> => {
  const { data, error } = await supabase
    .from("service_offers")
    .select("id,title,description,offer_type,transaction_type,impact_area,city,state_province,price_amount,price_type,tags,requirements")
    .eq("status", "active")
    .eq("admin_status", "approved")
    .or(`price_type.neq.fixed,price_amount.lte.${input.budget}`)
    .limit(200);

  if (error) {
    throw new Error(`Fallback query failed: ${error.message}`);
  }

  const rows = (Array.isArray(data) ? data : []) as OfferFallbackRow[];
  if (rows.length === 0) return [];

  const categoryNeedle = input.category.toLowerCase();
  const cityNeedle = input.city.toLowerCase();
  const stateNeedle = input.state_province.toLowerCase();
  const looseFiltered = rows.filter((row) => {
    const combined = `${row.title || ""} ${row.description || ""} ${valueToText(row.impact_area)} ${valueToText(row.tags)} ${valueToText(row.requirements)}`.toLowerCase();
    return combined.includes(categoryNeedle) || combined.includes(cityNeedle) || combined.includes(stateNeedle);
  });

  const candidates = looseFiltered.length > 0 ? looseFiltered : rows;
  return buildFallbackMatches(candidates, input).slice(0, 5);
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const coerced = RequestCoercionSchema.safeParse(body);
    if (!coerced.success) {
      return NextResponse.json<RecommendationResponse>(
        {
          success: false,
          error: "Validation failed",
          details: coerced.error.flatten().fieldErrors,
          ...(isDev
            ? {
                debug: {
                  reason: "coercion_validation_failed",
                  message: "Request payload failed route-level coercion validation",
                  details: coerced.error.flatten().fieldErrors,
                },
              }
            : {}),
        },
        { status: 400 }
      );
    }

    const validation = InputSchema.safeParse(coerced.data);
    if (!validation.success) {
      return NextResponse.json<RecommendationResponse>(
        {
          success: false,
          error: "Validation failed",
          details: validation.error.flatten().fieldErrors,
          ...(isDev
            ? {
                debug: {
                  reason: "input_validation_failed",
                  message: "Request payload failed matcher input validation",
                  details: validation.error.flatten().fieldErrors,
                },
              }
            : {}),
        },
        { status: 400 }
      );
    }

    let matches: CapabilityMatch[] = [];
    try {
      matches = await findServiceOffers(validation.data);
    } catch (err) {
      console.error("get-recommendations error:", err);
      return NextResponse.json<RecommendationResponse>(
        {
          success: false,
          error: err instanceof Error ? err.message : "Failed to fetch recommendations",
          ...(isDev
            ? {
                debug: {
                  reason: "matcher_error",
                  message: err instanceof Error ? err.message : "Unknown matcher error",
                },
              }
            : {}),
        },
        { status: 500 }
      );
    }

    const primaryMatches = matches.slice(0, 5);
    if (primaryMatches.length > 0) {
      return NextResponse.json<RecommendationResponse>({
        success: true,
        data: primaryMatches,
        ...(isDev
          ? {
              debug: {
                reason: "ok",
                message: "Matcher completed successfully",
              },
            }
          : {}),
      });
    }

    const fallbackMatches = await findServiceOffersFallback(coerced.data);
    return NextResponse.json<RecommendationResponse>({
      success: true,
      data: fallbackMatches,
      ...(isDev
        ? {
            debug:
              fallbackMatches.length > 0
                ? {
                    reason: "fallback_ok",
                    message: "Primary matcher returned empty results; fallback service_offers query returned matches",
                  }
                : {
                    reason: "empty_results",
                    message: "Matcher and fallback query both returned no results",
                  },
          }
        : {}),
    });
  } catch (error) {
    console.error("get-recommendations route error:", error);
    return NextResponse.json<RecommendationResponse>(
      {
        success: false,
        error: "Internal server error",
        ...(isDev
          ? {
              debug: {
                reason: "route_error",
                message: error instanceof Error ? error.message : "Unknown route error",
              },
            }
          : {}),
      },
      { status: 500 }
    );
  }
}
