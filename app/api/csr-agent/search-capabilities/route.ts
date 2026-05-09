import { NextRequest, NextResponse } from "next/server";
import {
    findServiceOffers,
    InputSchema,
    type CapabilityMatch,
} from "@/lib/csr-agent/find-service-offers";

/* ───────────────── TYPES ───────────────── */

type MatchOffersResponse =
    | { found: true;  data: CapabilityMatch[]; message: string }
    | { found: false; data: null; message: string; errors?: unknown }

/* ───────────────── ROUTE ───────────────── */

export const POST = async (request: NextRequest) => {
    try {
        const body = await request.json()

        // validation
        const validation = InputSchema.safeParse(body)
        if (!validation.success) {
            return NextResponse.json<MatchOffersResponse>(
                {
                    found: false,
                    data: null,
                    message: "Validation failed",
                    errors: validation.error.flatten().fieldErrors,
                },
                { status: 400 }
            )
        }

        // search
        let matches: CapabilityMatch[]
        try {
            matches = await findServiceOffers(validation.data)
        } catch (err) {
            console.error("match-offers search error:", err)
            return NextResponse.json<MatchOffersResponse>(
                {
                    found: false,
                    data: null,
                    message: "Search failed",
                },
                { status: 500 }
            )
        }

        if (!matches || matches.length === 0) {
            return NextResponse.json<MatchOffersResponse>({
                found: false,
                data: null,
                message: "No matching capability offers found for this campaign.",
            })
        }

        return NextResponse.json<MatchOffersResponse>({
            found: true,
            data: matches,
            message: "Capability offers found matching this campaign.",
        })

    } catch (error) {
        console.error("match-offers route error:", error)
        return NextResponse.json<MatchOffersResponse>(
            {
                found: false,
                data: null,
                message: "Internal server error",
            },
            { status: 500 }
        )
    }
}