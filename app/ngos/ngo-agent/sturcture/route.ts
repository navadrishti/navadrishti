import { NextRequest, NextResponse } from "next/server";
import { GeminiChat } from "@/lib/geminiClient";

const COST_LIBRARY: Record<string, number> = {
  education_kit:   500,
  meal_per_person:  30,
  blanket:          300,
  teacher_daily:    800,
  water_filter:    1500,
  medical_kit:     1200,
  sanitation_unit: 5000,
  volunteer_daily:  600,
};

const LOCATION_MULTIPLIERS: Record<string, number> = {
  urban: 1.20, rural: 1.00, remote: 1.30,
};

const URGENCY_MULTIPLIERS: Record<string, number> = {
  low: 1.00, medium: 1.05, high: 1.15, critical: 1.25,
};

const KEYWORD_TO_REQUEST_TYPE: Record<string, string> = {
  money: "financial", funding: "financial", fund: "financial", grant: "financial",
  kits: "material", food: "material", clothes: "material", blankets: "material", supplies: "material",
  training: "service", teachers: "service", volunteers: "service", coaching: "service",
  build: "infrastructure", construction: "infrastructure", infrastructure: "infrastructure", repair: "infrastructure",
};

const KEYWORD_TO_CATEGORY: Record<string, string> = {
  school: "Education", education: "Education", children: "Education", students: "Education",
  hospital: "Healthcare", health: "Healthcare", medical: "Healthcare", camp: "Healthcare",
  water: "Sanitation", sanitation: "Sanitation", toilet: "Sanitation",
  women: "Women Empowerment", girl: "Women Empowerment", gender: "Women Empowerment",
  food: "Hunger & Nutrition", meal: "Hunger & Nutrition", hunger: "Hunger & Nutrition",
  environment: "Environment", tree: "Environment",
  rural: "Rural Development", village: "Rural Development",
  skill: "Skill Development", vocational: "Skill Development",
};

const EVIDENCE_RULES: Record<string, string[]> = {
  financial:      ["utilization certificate", "invoices"],
  material:       ["photos", "distribution list"],
  service:        ["attendance logs"],
  infrastructure: ["progress photos", "completion proof"],
};

const URBAN_CITIES = ["mumbai", "delhi", "bangalore", "chennai", "hyderabad", "kolkata", "pune"];
const REMOTE_WORDS = ["tribal", "remote", "forest", "hills", "northeast"];

function detectRequestType(text: string): string {
  const lower = text.toLowerCase();
  for (const [kw, type] of Object.entries(KEYWORD_TO_REQUEST_TYPE)) {
    if (lower.includes(kw)) return type;
  }
  return "service";
}

function detectCategory(text: string): string {
  const lower = text.toLowerCase();
  for (const [kw, cat] of Object.entries(KEYWORD_TO_CATEGORY)) {
    if (lower.includes(kw)) return cat;
  }
  return "General";
}

function detectLocationType(location: string): string {
  const l = location.toLowerCase();
  if (URBAN_CITIES.some(c => l.includes(c))) return "urban";
  if (REMOTE_WORDS.some(w => l.includes(w)))  return "remote";
  return "rural";
}

function estimateBudget(
  requestType: string,
  beneficiaryCount: number,
  location: string,
  urgency: string,
  problemStatement: string
): number {
  const text = problemStatement.toLowerCase();
  let unitCost: number | null = null;

  for (const [item, cost] of Object.entries(COST_LIBRARY)) {
    if (item.split("_").some(w => text.includes(w))) { unitCost = cost; break; }
  }

  if (!unitCost) {
    const defaults: Record<string, number> = {
      financial: 500, material: 400, service: 600, infrastructure: 2000,
    };
    unitCost = defaults[requestType] ?? 500;
  }

  let base = unitCost * beneficiaryCount;
  if (requestType === "infrastructure") base *= 1.30;

  const locMult = LOCATION_MULTIPLIERS[detectLocationType(location)] ?? 1.0;
  const urgMult = URGENCY_MULTIPLIERS[urgency.toLowerCase()] ?? 1.0;

  return Math.round(base * locMult * urgMult);
}

function confidenceScore(s: Record<string, unknown>): number {
  let score = 0;
  if (s.title)              score += 0.20;
  if (s.description)        score += 0.15;
  if (s.request_type)       score += 0.15;
  if (s.category)           score += 0.15;
  if (s.location)           score += 0.10;
  if (s.beneficiary_count)  score += 0.10;
  if (s.estimated_budget)   score += 0.10;
  if (s.impact_description) score += 0.05;
  return Math.min(parseFloat(score.toFixed(2)), 1.0);
}

function generateSuggestions(s: Record<string, unknown>): string[] {
  const out: string[] = [];
  if (!s.timeline)
    out.push("Add a timeline for better campaign matching.");
  if ((s.estimated_budget as number) < 10000)
    out.push("Budget seems low for this scope — consider reviewing.");
  if ((s.beneficiary_count as number) > 500 && s.urgency_level === "low")
    out.push("Large beneficiary count — consider raising urgency level.");
  if (!s.requirements)
    out.push("Add specific skill or resource requirements for better matching.");
  return out;
}

function validate(s: Record<string, unknown>): { valid: boolean; error?: string } {
  if (!s.beneficiary_count || (s.beneficiary_count as number) <= 0)
    return { valid: false, error: "Beneficiary count must be greater than 0." };
  if (!s.location)
    return { valid: false, error: "Location is required." };
  if (!s.request_type)
    return { valid: false, error: "Could not detect request type from input." };
  if (s.request_type === "financial" && !s.estimated_budget)
    return { valid: false, error: "Budget is required for financial requests." };
  return { valid: true };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      ngo_id,
      problem_statement,
      location,
      beneficiary_count,
      urgency = "medium",
      timeline,
      additional_notes,
    } = body;

    if (!problem_statement)
      return NextResponse.json({ error: "Problem statement is required." }, { status: 400 });
    if (!location)
      return NextResponse.json({ error: "Location is required." }, { status: 400 });
    if (!beneficiary_count || beneficiary_count <= 0)
      return NextResponse.json({ error: "Valid beneficiary count is required." }, { status: 400 });

    const requestType = detectRequestType(problem_statement);
    const category    = detectCategory(problem_statement);
    const budget      = estimateBudget(requestType, beneficiary_count, location, urgency, problem_statement);
    const impact      = `Directly benefits ${beneficiary_count} people in ${location} under ${category}.`;
    const evidence    = EVIDENCE_RULES[requestType] ?? [];
    const tags        = requestType === "infrastructure" ? ["multi-phase"] : [];

    const prompt = `You are structuring an NGO service request. Extract a clean title and description.

Problem statement: ${problem_statement}
Location: ${location}
Beneficiaries: ${beneficiary_count}
Urgency: ${urgency}
Timeline: ${timeline ?? "not specified"}
Notes: ${additional_notes ?? "none"}

Return ONLY this JSON with no extra text or markdown:
{
  "title": "concise request title",
  "description": "2-3 sentence description of what is needed and why"
}`;

    let title: string;
    let description: string;

    try {
      const raw   = await GeminiChat([{ role: "user", content: prompt }]);
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      title       = parsed.title;
      description = parsed.description;
    } catch {
      title       = `${category} support for ${beneficiary_count} beneficiaries in ${location}`;
      description = problem_statement;
    }

    const structured: Record<string, unknown> = {
      title,
      description,
      request_type:       requestType,
      category,
      location,
      beneficiary_count,
      estimated_budget:   budget,
      budget_currency:    "INR",
      impact_description: impact,
      urgency_level:      urgency,
      required_by_date:   timeline ?? null,
      evidence_required:  evidence,
      requirements:       {},
      tags,
      timeline:           timeline ?? null,
    };

    const validation = validate(structured);
    if (!validation.valid)
      return NextResponse.json({ error: validation.error }, { status: 422 });

    structured.confidence_score = confidenceScore(structured);
    const suggestions = generateSuggestions(structured);

    return NextResponse.json({ status: "draft", structured, suggestions });

  } catch (err) {
    console.error("[ngos/ai-agent/structure]", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}