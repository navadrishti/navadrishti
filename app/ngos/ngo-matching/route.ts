import { NextRequest, NextResponse } from "next/server";
import { GeminiChat } from "@/lib/geminiClient";

const PROMPTS = {
  proposal: (data: Record<string, string>) => `You are an expert NGO proposal writer. Write a complete, professional project proposal.

Project Title: ${data.projectTitle}
Project Goal: ${data.projectGoal}
Target Audience: ${data.targetAudience}
Budget (INR): ${data.budget}

Write a complete proposal with these sections:
- Executive Summary
- Project Objectives (4 specific, measurable objectives)
- Budget Overview (breakdown by category as percentages)
- Expected Outcomes (4 measurable outcomes)
- Timeline and Implementation Strategy

Use professional NGO language. Be specific and compelling. Format clearly with section headers.`,

  documentation: (data: Record<string, string>) => `You are an expert NGO documentation specialist. Create a professional ${data.docType} document.

Document Type: ${data.docType}
Purpose: ${data.docPurpose}
Date: ${new Date().toLocaleDateString()}

Write a complete, well-structured document appropriate for this type and purpose.
Use professional language suitable for NGO operations. Include all relevant sections.`,

  outreach: (data: Record<string, string>) => `You are an expert NGO communications specialist. Write a professional outreach email.

Recipient Type: ${data.recipientType}
Campaign/Initiative: ${data.campaignName}
Email Purpose: ${data.emailPurpose}

Write a complete, compelling outreach email with:
- A strong subject line (start with "Subject: ")
- Professional greeting
- Clear value proposition
- Specific ask or call to action
- Professional sign-off

Use warm but professional tone appropriate for NGO outreach.`,
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, data } = body;

    if (!type)
      return NextResponse.json({ error: "type is required." }, { status: 400 });
    if (!data)
      return NextResponse.json({ error: "data is required." }, { status: 400 });

    const promptFn = PROMPTS[type as keyof typeof PROMPTS];
    if (!promptFn)
      return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });

    const prompt = promptFn(data);

    const result = await GeminiChat([{ role: "user", content: prompt }]);

    return NextResponse.json({ content: result });

  } catch (err) {
    console.error("[ngos/ngo-matching]", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}