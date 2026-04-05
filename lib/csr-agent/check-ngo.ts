import { z } from "zod";
import { supabase } from "@/lib/db";
import { embedText } from "@/lib/embeddings/embedding";
import { makeQuery } from "@/lib/embeddings/queryMaker";

/* ───────────────── SCHEMAS ───────────────── */

export const NGOMatchSchema = z.object({
  ngo_id: z.string(),
  title: z.string(),
  description: z.string(),
  category: z.string(),
  location: z.string(),
  estimated_budget: z.number().nullable(),
  similarity: z.number(),
});

const NGOMatchArraySchema = z.array(NGOMatchSchema);

export type NGOMatch = z.infer<typeof NGOMatchSchema>;

export const CheckNGOInputSchema = z.object({
    budget : z.number().positive(),
    milestones : z.number().int().positive(),
    category : z.string().min(1),
    location : z.string().min(1),
    start_date : z.coerce.date(),
    end_date : z.coerce.date(),
}).refine(
  (data) => data.start_date < data.end_date,
  {
    message: "start_date must be before end_date",
    path: ["end_date"],
  }
);

export type CheckNGOInput = z.infer<typeof CheckNGOInputSchema>;

/* ───────────────── SERVICE ───────────────── */

export async function searchNGOs(input: CheckNGOInput): Promise<NGOMatch[]> {
  const queryText = makeQuery(input);
  const embedding = await embedText(queryText);

  const MATCH_THRESHOLD = Number(process.env.MATCH_THRESHOLD ?? 0.7);
  const MATCH_COUNT = Number(process.env.MATCH_COUNT ?? 5);

// add rpc function in supabase to match NGO services based on embedding similarity, category, location, and budget

  const { data, error } = await supabase.rpc("match_ngo_services", {
    embedding,
    //match_threshold: MATCH_THRESHOLD,  //add later when more data in vector db
    match_count: MATCH_COUNT
  });

  if (error) {
    throw new Error(`match_ngo_services RPC error: ${error.message}`);
  }

  const parsed = NGOMatchArraySchema.safeParse(data);

  if (!parsed.success) {
    throw new Error("Invalid DB response shape");
  }

  return parsed.data;
}