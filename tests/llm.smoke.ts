import "dotenv/config";
import assert from "node:assert/strict";
import {
  generateCampaigns,
  generateCampaignsInputSchema,
  campaignSchema,
} from "@/lib/csr-agent/llm";

async function main() {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("Missing OPENROUTER_API_KEY. Set it before running this test.");
  }

  if (!process.env.OPENROUTER_MODEL) {
    throw new Error("Missing OPENROUTER_MODEL. Set it before running this test.");
  }

  const input = generateCampaignsInputSchema.parse({
    company_id: "smoke-test-company",
    budget: 1000000,
    milestones: 3,
    category: "Education and Skill Development",
    location: "Nagpur, Maharashtra",
    start_date: "2026-06-01",
    end_date: "2026-12-31",
  });

  console.log("Calling OpenRouter...\n");
  const campaigns = await generateCampaigns(input);

  assert.ok(Array.isArray(campaigns), "Expected campaigns to be an array");
  assert.ok(campaigns.length > 0, "Expected at least one campaign from LLM");

  campaigns.forEach((campaign, idx) => {
    const parsed = campaignSchema.safeParse(campaign);
    assert.ok(parsed.success, `Campaign at index ${idx} does not match schema`);
  });

  console.log(`LLM smoke test passed. Received ${campaigns.length} campaign(s).`);
  console.log("Campaign titles:");
  campaigns.forEach((campaign, idx) => {
    console.log(`${idx + 1}. ${campaign.title}`);
  });
}

main().catch((error) => {
  console.error("LLM smoke test failed:", error);
  process.exit(1);
});
