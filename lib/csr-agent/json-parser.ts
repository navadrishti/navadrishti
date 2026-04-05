export function parseJson(text: string): Record<string, unknown> {
  const cleaned = text
    .replace(/^```(?:json)?\s*/gm, "")
    .replace(/\s*```$/gm, "")
    .trim();

  const tryParseObject = (value: string): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return null;
    } catch {
      return null;
    }
  };

  const direct = tryParseObject(cleaned);
  if (direct) return direct;

  const start = cleaned.indexOf("{");
  if (start !== -1) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < cleaned.length; i++) {
      const ch = cleaned[i];

      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === '"') inString = false;
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }

      if (ch === "{") depth++;
      if (ch === "}") depth--;

      if (depth === 0) {
        const parsed = tryParseObject(cleaned.slice(start, i + 1));
        if (parsed) return parsed;
        break;
      }
    }
  }

  throw new Error(`Could not parse JSON from LLM output: ${cleaned.slice(0, 200)}`);
}