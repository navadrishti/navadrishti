import { NextRequest, NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"
import { supabase } from "@/lib/db"
import { randomUUID } from 'crypto'

type AgentKind = "csr" | "ngo"

type PersistedPayload = {
  sessions: any[]
  activeSessionId?: string
  updatedAt?: string
}

const toNumberOr = (value: unknown, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const buildStateFromSession = (agent: AgentKind, session: any) => {
  const sessionState = session?.state || session?.session_state || {}
  const incomingUiState = (sessionState?.ui_state && typeof sessionState.ui_state === "object") ? sessionState.ui_state : {}

  if (agent === "csr") {
    return {
      conversation_stage: sessionState?.conversation_stage || session?.conversationStage || undefined,
      project_data: sessionState?.project_data || session?.projectData || session?.project_context || {},
      milestone_count: sessionState?.milestone_count ?? session?.milestoneCount ?? null,
      milestone_inputs: sessionState?.milestone_inputs || session?.milestoneInputs || [],
      service_suggestions: sessionState?.service_suggestions || session?.serviceSuggestions || [],
      generated_campaigns: sessionState?.generated_campaigns || session?.generatedCampaigns || [],
      ui_state: {
        ...incomingUiState,
        projectStep: toNumberOr(session?.projectStep ?? incomingUiState?.projectStep, 0),
        milestoneIndex: toNumberOr(session?.milestoneIndex ?? incomingUiState?.milestoneIndex, 0),
        milestoneQuestionIndex: toNumberOr(session?.milestoneQuestionIndex ?? incomingUiState?.milestoneQuestionIndex, 0),
      },
    }
  }

  return {
    conversation_stage: sessionState?.conversation_stage || session?.conversationStage || undefined,
    project_data: sessionState?.project_data || session?.projectData || session?.project_context || {},
    needs_data: sessionState?.needs_data || session?.needsData || [],
    generated_draft: sessionState?.generated_draft || session?.generatedDraft || null,
    selected_offer_ids_by_need: sessionState?.selected_offer_ids_by_need || session?.selectedOfferIdsByNeed || {},
    ui_state: {
      ...incomingUiState,
      projectStep: toNumberOr(session?.projectStep ?? incomingUiState?.projectStep, 0),
      activeNeedIndex: toNumberOr(session?.activeNeedIndex ?? incomingUiState?.activeNeedIndex, 0),
      activeNeedQuestionIndex: toNumberOr(session?.activeNeedQuestionIndex ?? incomingUiState?.activeNeedQuestionIndex, 0),
      selectedOfferIdsByNeed: session?.selectedOfferIdsByNeed || incomingUiState?.selectedOfferIdsByNeed || {},
      generatedDraft: session?.generatedDraft || incomingUiState?.generatedDraft || null,
      needsData: session?.needsData || incomingUiState?.needsData || sessionState?.needs_data || [],
      needCount: session?.needCount ?? incomingUiState?.needCount ?? null,
    },
  }
}

const keyByAgent: Record<AgentKind, string> = {
  csr: "csr_ai_agent_progress",
  ngo: "ngo_ai_agent_progress",
}

const parseAgent = (value: unknown): AgentKind | null => {
  if (value === "csr" || value === "ngo") return value
  return null
}

const isValidUUID = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)

const getTokenFromRequest = (request: NextRequest): string | null => {
  const authHeader = request.headers.get("authorization")
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7)
  }
  return request.cookies.get("token")?.value || null
}

const getUserIdFromRequest = (request: NextRequest): number | null => {
  const token = getTokenFromRequest(request)
  if (!token) return null
  const user = verifyToken(token)
  return user?.id ?? null
}

const readProfileData = async (userId: number) => {
  const { data, error } = await supabase
    .from("users")
    .select("profile_data")
    .eq("id", userId)
    .single()

  if (error) throw error

  const profileData = data?.profile_data
  if (!profileData || typeof profileData !== "object") return {}
  return profileData as Record<string, unknown>
}

async function buildLatestPayloadFromTables(userId: number, agent: AgentKind) {
  const sessionsTable = agent === "csr" ? "csr_ai_agent_sessions" : "ngo_ai_agent_sessions"
  const stateTable = agent === "csr" ? "csr_ai_agent_session_state" : "ngo_ai_agent_session_state"

  const { data: rows, error } = await supabase
    .from(sessionsTable)
    .select("id, title, status, project_context, created_at, updated_at, last_message_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })

  if (error) throw error

  const sessionIds = (rows || []).map((r: any) => r.id)
  const { data: stateRows } = await supabase.from(stateTable).select("*").in("session_id", sessionIds)
  const stateBySession: Record<string, any> = {}
  for (const s of stateRows || []) stateBySession[s.session_id] = s

  const messagesTable = agent === "csr" ? "csr_ai_agent_messages" : "ngo_ai_agent_messages"
  const { data: messageRows } = await supabase
    .from(messagesTable)
    .select("session_id, role, content, meta, created_at")
    .in("session_id", sessionIds)
    .order("created_at", { ascending: true })

  const messagesBySession: Record<string, any[]> = {}
  for (const m of messageRows || []) {
    messagesBySession[m.session_id] = messagesBySession[m.session_id] || []
    messagesBySession[m.session_id].push({ role: m.role, content: m.content, meta: m.meta, createdAt: m.created_at })
  }

  const sessions = (rows || []).map((r: any) => {
    const state = stateBySession[r.id] || {}
    const uiState = state.ui_state && typeof state.ui_state === "object" ? state.ui_state : {}
    const base = {
      id: r.id,
      title: r.title,
      status: r.status,
      project_context: r.project_context,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      lastMessageAt: r.last_message_at,
      messages: messagesBySession[r.id] || [],
      projectData: state.project_data || r.project_context || {},
      projectStep: toNumberOr(uiState.projectStep, 0),
      conversationStage: state.conversation_stage || undefined,
      state,
    }

    if (agent === "csr") {
      return {
        ...base,
        milestoneCount: state.milestone_count ?? null,
        milestoneInputs: state.milestone_inputs || [],
        milestoneIndex: toNumberOr(uiState.milestoneIndex, 0),
        milestoneQuestionIndex: toNumberOr(uiState.milestoneQuestionIndex, 0),
        serviceSuggestions: state.service_suggestions || [],
        generatedCampaigns: state.generated_campaigns || [],
      }
    }

    const ngoNeeds = state.needs_data || uiState.needsData || []
    return {
      ...base,
      needCount: uiState.needCount ?? (Array.isArray(ngoNeeds) ? ngoNeeds.length : null),
      needsData: ngoNeeds,
      activeNeedIndex: toNumberOr(uiState.activeNeedIndex, 0),
      activeNeedQuestionIndex: toNumberOr(uiState.activeNeedQuestionIndex, 0),
      selectedOfferIdsByNeed: state.selected_offer_ids_by_need || uiState.selectedOfferIdsByNeed || {},
      generatedDraft: state.generated_draft || uiState.generatedDraft || null,
    }
  })

  const updatedAt = sessions.reduce((acc: string | null, s: any) => {
    return acc === null || (s.updatedAt && new Date(s.updatedAt) > new Date(acc)) ? s.updatedAt : acc
  }, null as string | null)

  const profileData = await readProfileData(userId)
  const key = keyByAgent[agent]
  const legacy = profileData[key] as any

  return {
    sessions,
    activeSessionId: legacy?.activeSessionId ?? null,
    updatedAt: updatedAt || new Date().toISOString(),
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromRequest(request)
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const agent = parseAgent(searchParams.get("agent"))
    if (!agent) {
      return NextResponse.json({ error: "Invalid agent" }, { status: 400 })
    }

    const sessionsTable = agent === "csr" ? "csr_ai_agent_sessions" : "ngo_ai_agent_sessions"
    const { data: sessionsData, error: sessionsErr } = await supabase
      .from(sessionsTable)
      .select("id")
      .eq("user_id", userId)

    if (sessionsErr) throw sessionsErr

    if (Array.isArray(sessionsData) && sessionsData.length > 0) {
      const payload = await buildLatestPayloadFromTables(userId, agent)
      return NextResponse.json({ success: true, data: payload })
    }

    // Fallback to legacy profile_data
    const profileData = await readProfileData(userId)
    const key = keyByAgent[agent]
    const payload = profileData[key]

    if (!payload || typeof payload !== "object") {
      return NextResponse.json({ success: true, data: null })
    }

    return NextResponse.json({ success: true, data: payload })
  } catch (error) {
    console.error("Failed to read AI agent progress", error)
    return NextResponse.json({ error: "Failed to read AI agent progress" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = getUserIdFromRequest(request)
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const agent = parseAgent(body?.agent)
    const rawData = body?.data as PersistedPayload | undefined

    if (!agent) {
      return NextResponse.json({ error: "Invalid agent" }, { status: 400 })
    }

    if (!rawData || !Array.isArray(rawData.sessions)) {
      return NextResponse.json({ error: "Invalid data payload" }, { status: 400 })
    }

    const incomingUpdatedAt =
      typeof rawData.updatedAt === "string" && Number.isFinite(Date.parse(rawData.updatedAt))
        ? rawData.updatedAt
        : new Date().toISOString()

    const normalizedPayload: PersistedPayload = {
      sessions: rawData.sessions,
      activeSessionId: typeof rawData.activeSessionId === "string" ? rawData.activeSessionId : undefined,
      updatedAt: incomingUpdatedAt,
    }

    const sessionsTable = agent === "csr" ? "csr_ai_agent_sessions" : "ngo_ai_agent_sessions"
    const stateTable = agent === "csr" ? "csr_ai_agent_session_state" : "ngo_ai_agent_session_state"
    const messagesTable = agent === "csr" ? "csr_ai_agent_messages" : "ngo_ai_agent_messages"

    // Compute server latest timestamp
    const { data: existingSessions } = await supabase
      .from(sessionsTable)
      .select("updated_at")
      .eq("user_id", userId)

    const serverUpdatedAt = Array.isArray(existingSessions) && existingSessions.length > 0
      ? existingSessions.reduce((acc: string | null, r: any) => acc === null || (r.updated_at && new Date(r.updated_at) > new Date(acc)) ? r.updated_at : acc, null as string | null)
      : null

    if (serverUpdatedAt && Date.parse(incomingUpdatedAt) < Date.parse(serverUpdatedAt)) {
      const latestPayload = await buildLatestPayloadFromTables(userId, agent)
      return NextResponse.json({ error: "Stale progress payload", latest: latestPayload }, { status: 409 })
    }

    // If no table-backed sessions exist yet, try migrating legacy profile_data into tables
    if ((!existingSessions || existingSessions.length === 0)) {
      try {
        const profileData = await readProfileData(userId)
        const key = keyByAgent[agent]
        const legacy = profileData[key] as PersistedPayload | undefined
        if (legacy && Array.isArray(legacy.sessions) && legacy.sessions.length > 0) {
          const toInsert: any[] = []
          const legacyIdMap: Record<string, string> = {}
          for (const s of legacy.sessions) {
            const origId = s.id
            const idToUse = isValidUUID(origId) ? origId : randomUUID()
            if (!isValidUUID(origId) && origId) legacyIdMap[idToUse] = origId
            toInsert.push({
              id: idToUse,
              user_id: userId,
              title: s.title || "Untitled session",
              status: s.status || "active",
              project_context: s.project_context || {},
              created_at: s.createdAt || new Date().toISOString(),
              updated_at: legacy.updatedAt || new Date().toISOString(),
              last_message_at: s.lastMessageAt || null,
            })
          }

          const { error: upsertErr } = await supabase.from(sessionsTable).upsert(toInsert, { onConflict: 'id' })
          if (upsertErr) console.warn('Migration upsert sessions error', upsertErr)

          const legacyMessageRows: any[] = []
          for (const s of legacy.sessions) {
            const origId = s.id
            const idToUse = isValidUUID(origId) ? origId : Object.keys(legacyIdMap).find(k => legacyIdMap[k] === origId) || randomUUID()
            if (s.state || s.session_state || s.projectData || s.project_context || s.conversationStage) {
              const state = buildStateFromSession(agent, s)
              const ui_state = state.ui_state || {}
              if (!isValidUUID(origId) && origId) ui_state.legacyId = origId
              const stateRow = agent === "csr"
                ? {
                    session_id: idToUse,
                    conversation_stage: state.conversation_stage || undefined,
                    project_data: state.project_data || {},
                    milestone_count: state.milestone_count ?? null,
                    milestone_inputs: state.milestone_inputs || [],
                    service_suggestions: state.service_suggestions || [],
                    generated_campaigns: state.generated_campaigns || [],
                    ui_state,
                    updated_at: legacy.updatedAt || new Date().toISOString(),
                  }
                : {
                    session_id: idToUse,
                    conversation_stage: state.conversation_stage || undefined,
                    project_data: state.project_data || {},
                    needs_data: state.needs_data || [],
                    generated_draft: state.generated_draft || null,
                    selected_offer_ids_by_need: state.selected_offer_ids_by_need || {},
                    ui_state,
                    updated_at: legacy.updatedAt || new Date().toISOString(),
                  }
              await supabase.from(stateTable).upsert(stateRow, { onConflict: 'session_id' })
            }

            const messages = Array.isArray(s.messages) ? s.messages : []
            for (const message of messages) {
              if (!message || typeof message !== 'object') continue
              const role = message.role === 'user' || message.role === 'assistant' || message.role === 'system' ? message.role : 'assistant'
              const content = typeof message.content === 'string' ? message.content : String(message.content || '')
              legacyMessageRows.push({
                session_id: idToUse,
                role,
                content,
                meta: message.meta || {},
                created_at: message.createdAt || new Date().toISOString(),
              })
            }
          }

          if (legacyMessageRows.length > 0) {
            await supabase.from(messagesTable).insert(legacyMessageRows)
          }
        }
      } catch (e) {
        console.warn('Migration from profile_data failed', e)
      }
    }

    // Upsert incoming sessions/state into the dedicated tables
    const incomingSessions = normalizedPayload.sessions as any[]
    const idMap: Record<string, string> = {}
    const sessionRows = incomingSessions.map((s: any) => {
      const origId = s.id
      const idToUse = isValidUUID(origId) ? origId : randomUUID()
      if (!isValidUUID(origId) && origId) idMap[origId] = idToUse
      return {
        id: idToUse,
        user_id: userId,
        title: s.title || "Untitled session",
        status: s.status || "active",
        project_context: s.project_context || s.projectData || {},
        created_at: s.createdAt || new Date().toISOString(),
        updated_at: normalizedPayload.updatedAt || new Date().toISOString(),
        last_message_at: s.lastMessageAt || null,
      }
    })

    const { error: upsertSessionsError } = await supabase.from(sessionsTable).upsert(sessionRows, { onConflict: 'id' })
    if (upsertSessionsError) throw upsertSessionsError

    const messageRows: any[] = []
    for (const s of incomingSessions) {
      const origId = s.id
      const assignedId = isValidUUID(origId) ? origId : idMap[origId]
      if (!assignedId) continue
      const messages = Array.isArray(s.messages) ? s.messages : []
      for (const message of messages) {
        if (!message || typeof message !== 'object') continue
        const role = message.role === 'user' || message.role === 'assistant' || message.role === 'system' ? message.role : 'assistant'
        const content = typeof message.content === 'string' ? message.content : String(message.content || '')
        messageRows.push({
          session_id: assignedId,
          role,
          content,
          meta: message.meta || {},
          created_at: message.createdAt || new Date().toISOString(),
        })
      }
    }

    if (sessionRows.length > 0) {
      const { error: deleteMessagesError } = await supabase
        .from(messagesTable)
        .delete()
        .in('session_id', sessionRows.map((row) => row.id))
      if (deleteMessagesError) console.warn('Failed to clear existing session messages', deleteMessagesError)
    }

    if (messageRows.length > 0) {
      const { error: insertMessagesError } = await supabase.from(messagesTable).insert(messageRows)
      if (insertMessagesError) console.warn('Failed to insert session messages', insertMessagesError)
    }

    for (const s of incomingSessions) {
      const origId = s.id
      const assignedId = isValidUUID(origId) ? origId : idMap[origId]
      if (!assignedId) continue
      const state = buildStateFromSession(agent, s)
      const ui_state = state.ui_state || {}
      if (!isValidUUID(origId) && origId) ui_state.legacyId = origId
      const stateRow: any = agent === "csr"
        ? {
            session_id: assignedId,
            conversation_stage: state.conversation_stage || undefined,
            project_data: state.project_data || {},
            milestone_count: state.milestone_count ?? null,
            milestone_inputs: state.milestone_inputs || [],
            service_suggestions: state.service_suggestions || [],
            generated_campaigns: state.generated_campaigns || [],
            ui_state,
            updated_at: normalizedPayload.updatedAt || new Date().toISOString(),
          }
        : {
            session_id: assignedId,
            conversation_stage: state.conversation_stage || undefined,
            project_data: state.project_data || {},
            needs_data: state.needs_data || [],
            generated_draft: state.generated_draft || null,
            selected_offer_ids_by_need: state.selected_offer_ids_by_need || {},
            ui_state,
            updated_at: normalizedPayload.updatedAt || new Date().toISOString(),
          }
      const { error: upsertStateErr } = await supabase.from(stateTable).upsert(stateRow, { onConflict: 'session_id' })
      if (upsertStateErr) console.warn('Failed to upsert session state', upsertStateErr)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to save AI agent progress", error)
    return NextResponse.json({ error: "Failed to save AI agent progress" }, { status: 500 })
  }
}
