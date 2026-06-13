import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { deleteAgentSessionForUser } from '@/lib/ai-agent-sessions'

type AgentKind = 'csr' | 'ngo'

const parseAgent = (value: unknown): AgentKind | null => {
  if (value === 'csr' || value === 'ngo') return value
  return null
}

const getUserIdFromRequest = (request: NextRequest): number | null => {
  const authHeader = request.headers.get('authorization')
  const token =
    authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : request.cookies.get('token')?.value || null

  if (!token) return null
  const user = verifyToken(token)
  return user?.id ?? null
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = getUserIdFromRequest(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: sessionId } = await params
    const { searchParams } = new URL(request.url)
    const agent = parseAgent(searchParams.get('agent'))

    if (!agent) {
      return NextResponse.json({ error: 'Invalid agent' }, { status: 400 })
    }

    if (!sessionId?.trim()) {
      return NextResponse.json({ error: 'Session id is required' }, { status: 400 })
    }

    const outcome = await deleteAgentSessionForUser(agent, userId, sessionId.trim())

    return NextResponse.json({
      success: true,
      outcome,
      message:
        outcome === 'archived'
          ? 'Conversation removed from history. The published project or campaign remains live for tracking.'
          : 'Conversation deleted.',
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete session'
    const status = message === 'Session not found' ? 404 : 500
    console.error('Failed to delete AI agent session', error)
    return NextResponse.json({ error: message }, { status })
  }
}
