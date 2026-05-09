import "dotenv/config";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/csr-agent/search-capabilities/route";

type SearchPayload = {
  campaignName?: string;
  category?: string;
  location?: string;
  budget?: number;
  requirementDetails?: string;
  requirement_details?: string;
  startDate?: string;
  start_date?: string;
  endDate?: string;
  end_date?: string;
};

async function callSearch(payload: SearchPayload) {
  const request = new NextRequest("http://localhost:3000/api/csr-agent/search-capabilities", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const response = await POST(request);
  const data = await response.json();
  return { status: response.status, data } as const;
}

async function testMissingCategory() {
  const result = await callSearch({
    location: "Mumbai",
    budget: 50000,
    requirementDetails: "Need material support",
  });

  assert.equal(result.status, 400, "Expected 400 when category is missing");
  assert.equal(result.data.success, false, "Expected success=false when category is missing");
  assert.match(String(result.data.error), /category/i, "Expected category-related error");
  console.log("PASS: missing category validation");
}

async function testMissingLocation() {
  const result = await callSearch({
    category: "Material Supply",
    budget: 50000,
    requirementDetails: "Need material support",
  });

  assert.equal(result.status, 400, "Expected 400 when location is missing");
  assert.equal(result.data.success, false, "Expected success=false when location is missing");
  assert.match(String(result.data.error), /location/i, "Expected location-related error");
  console.log("PASS: missing location validation");
}

async function testInvalidBudget() {
  const result = await callSearch({
    category: "Material Supply",
    location: "NCR",
    budget: -100,
    requirementDetails: "Need distribution support",
  });

  assert.equal(result.status, 400, "Expected 400 when budget is invalid");
  assert.equal(result.data.success, false, "Expected success=false when budget is invalid");
  assert.match(String(result.data.error), /budget/i, "Expected budget-related error");
  console.log("PASS: invalid budget validation");
}

async function testRequirementDetailsAlias() {
  const result = await callSearch({
    category: "Material Supply",
    location: "NCR",
    requirement_details: "Need support for clothing distribution",
  });

  // If alias wasn't recognized, we'd get requirementDetails error first.
  // Getting budget error confirms alias is accepted by validation layer.
  assert.equal(result.status, 400, "Expected 400 for missing budget");
  assert.equal(result.data.success, false, "Expected success=false for missing budget");
  assert.match(String(result.data.error), /budget/i, "Expected budget error when using requirement_details alias");
  console.log("PASS: requirement_details alias accepted by validation");
}

async function main() {
  const hasSupabaseEnv =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!hasSupabaseEnv) {
    console.warn(
      "SKIP live Supabase test: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env/.env.local"
    );
  }

  await testMissingCategory();
  await testMissingLocation();
  await testInvalidBudget();
  await testRequirementDetailsAlias();

  if (hasSupabaseEnv) {
    const live = await callSearch({
      category: "Material Supply",
      location: "NCR",
      budget: 200000,
      requirementDetails: "Need material distribution and logistics support",
      campaignName: "Live Supabase Connectivity Check",
    });

    assert.equal(live.status, 200, "Expected 200 from live Supabase search route");
    assert.equal(live.data.success, true, "Expected success=true from live Supabase search route");
    assert.ok(Array.isArray(live.data.offers), "Expected offers array from live Supabase response");
    assert.ok(typeof live.data.count === "number", "Expected numeric count in live response");
    console.log(`PASS: live Supabase fetch, offers=${live.data.count}`);
  }

  console.log("service-offers test suite passed.");
}

main().catch((error) => {
  console.error("service-offers test suite failed:", error);
  process.exit(1);
});
