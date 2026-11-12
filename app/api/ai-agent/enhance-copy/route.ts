import { NextRequest, NextResponse } from 'next/server'
import { enhanceNgoCopy, type NgoCopyDraft } from '@/lib/geminiClient'
import { authErrorResponse, getAuthUserFromRequest } from '@/lib/server-auth'

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUserFromRequest(request)
    if (user.user_type !== 'ngo') {
      return NextResponse.json({ error: 'Only NGOs can enhance NGO drafts' }, { status: 403 })
    }

    const body = await request.json() as { draft?: NgoCopyDraft }
    if (!body.draft?.project || !Array.isArray(body.draft.needs)) {
      return NextResponse.json({ error: 'A valid NGO draft is required' }, { status: 400 })
    }

    const draft = await enhanceNgoCopy(body.draft)
    return NextResponse.json({ success: true, draft })
  } catch (error) {
    const auth = authErrorResponse(error)
    if (auth) return auth
    console.error('NGO copy enhancement error:', error instanceof Error ? error.name : 'error')
    return NextResponse.json({ error: 'Unable to enhance draft copy' }, { status: 500 })
  }
}
