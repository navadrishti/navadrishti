const OPENROUTER_URL    = "https://openrouter.ai/api/v1/chat/completions";
const PRIMARY_MODEL     = "meta-llama/llama-3.3-70b-instruct:free";
const FALLBACK_MODEL    = "mistralai/mistral-7b-instruct:free";

async function callModel(prompt: string, model: string): Promise<string> {
  const res = await fetch(OPENROUTER_URL, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${model} failed: ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content as string;
}

export async function generateText(prompt: string): Promise<string> {
  try {
    return await callModel(prompt, PRIMARY_MODEL);
  } catch {
    return await callModel(prompt, FALLBACK_MODEL);
  }
}