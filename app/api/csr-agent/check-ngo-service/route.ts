import { NextRequest, NextResponse } from "next/server";
import {
  searchNGOs,
  CheckNGOInputSchema,
  type NGOMatch,
} from "@/lib/csr-agent/check-ngo";

/* ───────────────── TYPES ───────────────── */

type CheckNGOResponse =
  | { found: true; data: NGOMatch[]; message: string }
  | { found: false; data: null; message: string; errors?: unknown };

/* ───────────────── ROUTE ───────────────── */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const validation = CheckNGOInputSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json<CheckNGOResponse>(
        {
          found: false,
          data: null,
          message: "Validation failed",
          errors: validation.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    let matches: NGOMatch[];

    try {
      matches = await searchNGOs(validation.data);
    } catch (err) {
      console.error("NGO search error:", err);
      return NextResponse.json<CheckNGOResponse>(
        {
          found: false,
          data: null,
          message: "Vector search failed",
        },
        { status: 500 }
      );
    }

    if (!matches || matches.length === 0) {
      return NextResponse.json<CheckNGOResponse>({
        found: false,
        data: null,
        message: "No matching NGO service found for the given CSR preferences.",
      });
    }

    return NextResponse.json<CheckNGOResponse>({
      found: true,
      data: matches,
      message: "NGO service found matching the CSR preferences.",
    });
  } catch (error) {
    console.error("check-ngo-service error:", error);
    return NextResponse.json<CheckNGOResponse>(
      {
        found: false,
        data: null,
        message: "Internal server error",
      },
      { status: 500 }
    );
  }
}