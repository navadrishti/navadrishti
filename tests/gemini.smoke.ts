import "dotenv/config";
import assert from "node:assert/strict";
import { GeminiChat, GeminiError } from "@/lib/geminiClient";

async function expectReject(fn: () => Promise<unknown>, message: string) {
  let failed = false;
  try {
    await fn();
  } catch {
    failed = true;
  }
  assert.ok(failed, message);
}

async function testValidJsonAndShape() {
  const out = await GeminiChat([
    { role: "system", content: "Return strict JSON only." },
    { role: "user", content: "Return exactly: {\"ok\":true}" },
  ]);

  assert.ok(typeof out === "string" && out.trim().length > 0, "Output should be non-empty string");

  let parsed: unknown;
  try {
    parsed = JSON.parse(out);
  } catch (e) {
    throw new Error("Output is not valid JSON: " + String(e) + " | raw=" + out.slice(0, 200));
  }

  assert.equal(typeof parsed, "object", "Parsed JSON should be an object");
  assert.ok(parsed !== null, "Parsed JSON should not be null");
  assert.equal((parsed as { ok?: unknown }).ok, true, "Expected JSON shape: { ok: true }");
  console.log("PASS: valid JSON + exact shape");
}

async function testGeminiErrorPath() {
  const Primary = process.env.GEMINI_MODEL;
  const Fallback = process.env.GEMINI_FALLBACK_MODEL;

  process.env.GEMINI_MODEL = "invalid-model-for-error-test";
  process.env.GEMINI_FALLBACK_MODEL = "invalid-model-for-error-test";

  try {
    await expectReject(
      async () => {
        await GeminiChat([{ role: "user", content: "hello" }], 3);
      },
      "Expected GeminiChat to throw for invalid model"
    );

    try {
      await GeminiChat([{ role: "user", content: "hello" }], 3);
    } catch (err) {
      assert.ok(err instanceof GeminiError, "Expected GeminiError on API failure path");
      assert.ok((err as GeminiError).status >= 400, "Expected HTTP-like status on GeminiError");
    }
  } finally {
    if (Primary === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = Primary;

    if (Fallback === undefined) delete process.env.GEMINI_FALLBACK_MODEL;
    else process.env.GEMINI_FALLBACK_MODEL = Fallback;
  }

  console.log("PASS: GeminiError handling path");
}

/*async function testFallbackRetryBehavior() {
  const Primary = process.env.GEMINI_MODEL;
  const Fallback = process.env.GEMINI_FALLBACK_MODEL;

  process.env.GEMINI_MODEL = "invalid-model-for-fallback-test";
  if (!process.env.GEMINI_FALLBACK_MODEL) {
    process.env.GEMINI_FALLBACK_MODEL = "gemini-2.0-flash-lite";
  }

  try {
    const out = await GeminiChat([
      { role: "system", content: "Return strict JSON only." },
      { role: "user", content: "Return exactly: {\"fallback_ok\":true}" },
    ]);
    const parsed = JSON.parse(out);
    assert.equal((parsed as { fallback_ok?: unknown }).fallback_ok, true, "Fallback flow did not return expected JSON");
  } finally {
    if (Primary === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = Primary;

    if (Fallback === undefined) delete process.env.GEMINI_FALLBACK_MODEL;
    else process.env.GEMINI_FALLBACK_MODEL = Fallback;
  }

  console.log("PASS: fallback + retry behavior");
}*/

async function testFallbackModelPath() {
  const Primary = process.env.GEMINI_MODEL;
  const Fallback = process.env.GEMINI_FALLBACK_MODEL;

  try {
    // Start directly at retryCount=2 to force fallback model path.
    const out = await GeminiChat(
      [
        { role: "system", content: "Return strict JSON only." },
        { role: "user", content: "Return exactly: {\"fallback_ok\":true}" },
      ],
      2
    );

    const parsed = JSON.parse(out);
    assert.equal(
      (parsed as { fallback_ok?: unknown }).fallback_ok,
      true,
      "Fallback model path did not return expected JSON"
    );
  } finally {
    if (Primary === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = Primary;

    if (Fallback === undefined) delete process.env.GEMINI_FALLBACK_MODEL;
    else process.env.GEMINI_FALLBACK_MODEL = Fallback;
  }

  console.log("PASS: fallback model path");
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  await testValidJsonAndShape();
  await testGeminiErrorPath();
  await testFallbackModelPath();

  console.log("Gemini smoke suite passed.");
}

main().catch((e) => {
  console.error("Gemini smoke suite failed:", e);
  process.exit(1);
});