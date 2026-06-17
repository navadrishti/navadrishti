import { createServerClient } from "@/lib/db";

export async function embedText(text: string): Promise<number[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase.functions.invoke("embed", {
    body: { input: text },
  });
  if (error) throw new Error(`Embedding failed: ${error.message}`);
  return data.embedding as number[];
}