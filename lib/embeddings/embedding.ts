// lib/embeddings/embedding.ts

import { supabase } from "@/lib/db";

export async function embedText(text: string): Promise<number[]> {
  const { data, error } = await supabase.functions.invoke("embed", {
    body: { input: text },
  });

  if (error) {
    throw new Error(`Supabase embed error: ${error.message}`);
  }

  const embedding: number[] = data?.embedding;

  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error("Empty embedding returned from Supabase");
  }

  return embedding;
}