export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class GeminiError extends Error {
  constructor(public status: number, message: string, public isSafety?: boolean) {
    super(message);
    this.name = "GeminiError";
  }
}

export async function GeminiChat(messages: ChatMessage[], retryCount = 0): Promise<string> {
  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) throw new Error("GEMINI_API_KEY is missing.");

  const PRIMARY = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const FALLBACK = process.env.GEMINI_FALLBACK_MODEL || "gemini-2.5-flash-lite";
  
  const currentModel = retryCount < 2 ? PRIMARY : FALLBACK;
  const URL = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${API_KEY}`;

  const conversation = messages.filter((m) => m.role !== "system");
  const systemMsg = messages.find((m) => m.role === "system");
  
  if (conversation.length === 0) throw new Error("At least one user/assistant message is required.");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: conversation.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        ...(systemMsg && { 
          systemInstruction: { parts: [{ text: systemMsg.content }] } 
        }),
        generationConfig: {
          temperature: 0.1, // Low temp for consistent CSR logic
          responseMimeType: "application/json", // Forces valid JSON output
          maxOutputTokens: 8192
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // 5. ERROR & RETRY HANDLING
    if (!res.ok) {
      // Retry on Rate Limits (429) or Server Errors (5xx)
      if ((res.status === 429 || res.status >= 500) && retryCount < 3) {
        
        // A. Honor "Retry-After" header if Google provided one (in seconds)
        const retryAfterHeader = res.headers.get("retry-after");
        let waitTime = Math.pow(2, retryCount) * 1000 + Math.random() * 500; // Default: Exp. Backoff + Jitter

        if (res.status === 429 && retryAfterHeader) {
          const seconds = parseInt(retryAfterHeader, 10);
          if (!isNaN(seconds)) waitTime = seconds * 1000;
        }

        await new Promise((r) => setTimeout(r, waitTime));
        return GeminiChat(messages, retryCount + 1);
      }
      
      // If not retrying, throw the error with the API's message
      throw new GeminiError(res.status, await res.text());
    }

    const data = await res.json();
    const candidate = data?.candidates?.[0];

    // 6. SAFETY FILTERS
    // Gemini may return a 200 OK but block the content. We must check finishReason.
    if (!candidate || candidate.finishReason === "SAFETY") {
      throw new GeminiError(res.status || 400, "Safety block or empty response.", true);
    }

    // 7. MULTI-PART EXTRACTION
    // Joins all text segments to ensure the full JSON string is captured.
    const output = candidate.content?.parts
      ?.map((p: any) => p.text)
      .filter(Boolean)
      .join("")
      .trim();

    if (!output) throw new Error("Empty response from drafting service.");
    
    return output;

  } catch (error: any) {
    clearTimeout(timeoutId);
    
    // 8. TRANSIENT NETWORK FAILURES
    // Retries if the internet connection blipped (DNS/Socket issues).
    const isNetworkError = error instanceof TypeError || error.name === 'FetchError';
    if (isNetworkError && retryCount < 3) {
      await new Promise((r) => setTimeout(r, 1500));
      return GeminiChat(messages, retryCount + 1);
    }

    // Pass the AbortError or standard errors back to the caller
    if (error.name === "AbortError") throw new Error("Drafting request timed out.");
    throw error;
  }
}