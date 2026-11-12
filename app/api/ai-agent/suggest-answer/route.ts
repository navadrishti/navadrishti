import { NextRequest, NextResponse } from "next/server"
import { suggestQuestionAnswer } from "@/lib/geminiClient"
import { authErrorResponse, getAuthUserFromRequest } from "@/lib/server-auth"

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(request)
    if (user.user_type !== "ngo" && user.user_type !== "company") {
      return NextResponse.json({ error: "This suggestion service is not available for this account." }, { status: 403 })
    }

    const body = await request.json() as {
      agent?: "ngo" | "csr"
      question?: string
      context?: Record<string, unknown>
    }
    const agent = body.agent
    const question = String(body.question || "").trim()
    if ((agent !== "ngo" && agent !== "csr") || !question || !body.context || typeof body.context !== "object") {
      return NextResponse.json({ error: "A valid agent, question, and context are required." }, { status: 400 })
    }
    if ((agent === "ngo" && user.user_type !== "ngo") || (agent === "csr" && user.user_type !== "company")) {
      return NextResponse.json({ error: "The selected agent is not available for this account." }, { status: 403 })
    }

    const suggestion = await suggestQuestionAnswer({ agent, question, context: body.context })
    return NextResponse.json({ success: true, suggestion })
  } catch (error) {
    const auth = authErrorResponse(error)
    if (auth) return auth
    console.error("Question suggestion error:", error instanceof Error ? error.name : "error")
    return NextResponse.json({ error: "Suggestions are currently unavailable. You can continue by typing your answer." }, { status: 502 })
  }
}
