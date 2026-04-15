/**
 * GEMINI 2.0  PRODUCTION CLIENT  -> Change after July 1 because Gemini 2.0 will be deprecated.
 * * Purpose: Robust JSON generation for CSR Strategy Drafts.
 * Features: Exponential backoff, 429 Retry-After handling, Model rotation, 
 * JSON mode enforcement, and Abort signals.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Custom Error Class to help the UI distinguish between 
 * a "Rate Limit" and a "Safety Block."
 */
export class GeminiError extends Error {
  constructor(public status: number, message: string, public isSafety?: boolean) {
    super(message);
    this.name = "GeminiError";
  }
}

/**
 * Main Chat Function
 * @param messages - Array of ChatMessages (OpenAI format)
 * @param retryCount - Internal counter for recursion
 */
export async function GeminiChat(messages: ChatMessage[], retryCount = 0): Promise<string> {
  
  // 1. API KEY GUARD
  // Prevents "undefined" being injected into the URL string.
  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) throw new Error("GEMINI_API_KEY is missing.");

  // 2. MODEL ROTATION LOGIC
  // We use GA (General Availability) models for stability in production.
  const PRIMARY = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const FALLBACK = process.env.GEMINI_FALLBACK_MODEL || "gemini-2.5-flash-lite";
  
  // Logic: Attempts 0 & 1 use Primary. Attempts 2 & 3 use Fallback.
  const currentModel = retryCount < 2 ? PRIMARY : FALLBACK;
  const URL = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${API_KEY}`;

  // 3. DATA TRANSFORMATION
  // Gemini REST requires 'model' role instead of 'assistant' and 'parts' nesting.
  const conversation = messages.filter((m) => m.role !== "system");
  const systemMsg = messages.find((m) => m.role === "system");
  
  // Guard: Gemini will return 400 if 'contents' is empty.
  if (conversation.length === 0) throw new Error("At least one user/assistant message is required.");

  // 4. TIMEOUT (AbortController)
  // Stops the request if the API hangs for > 20s to prevent server resource leaks.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 50000);

  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: conversation.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        // System instructions are passed separately in Gemini for better persona adherence
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

    if (!output) throw new Error("Gemini returned empty text parts.");
    
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
    if (error.name === "AbortError") throw new Error("Gemini request timed out.");
    throw error;
  }
}