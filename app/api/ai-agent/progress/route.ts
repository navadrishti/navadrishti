import { NextRequest, NextResponse } from "next/server"
import { supabase, pruneRemovedAgentSessions } from "@/lib/db"
import { createHash } from 'crypto'
import { findAuthUser } from "@/lib/server-auth"
import {
  buildProjectContextWithPublished,
  readPublishedEntity,
} from "@/lib/ai-agent-sessions"
import type { Json, Tables, TablesInsert } from "@/lib/database.types"

type AgentKind = "csr" | "ngo"

type JsonObject = { [key: string]: Json | undefined }

type PersistedSessionState = {
  conversation_stage?: string
  project_data?: Json
  milestone_count?: number | null
  milestone_inputs?: Json
  service_suggestions?: Json
  generated_campaigns?: Json
  needs_data?: Json
  generated_draft?: Json
  selected_offer_ids_by_need?: Json
  ui_state?: JsonObject
}

type PersistedMessage = {
  role?: string
  content?: unknown
  meta?: Json
  createdAt?: string
}

// Sessions are client-authored UI snapshots mixing camelCase and snake_case fields.
type PersistedSession = {
  id: string
  title?: string
  status?: string
  project_context?: Json
  createdAt?: string
  lastMessageAt?: string | null
  messages?: Array<PersistedMessage | null>
  state?: PersistedSessionState
  session_state?: PersistedSessionState
  conversationStage?: string
  projectData?: Json
  projectStep?: number
  milestoneCount?: number | null
  milestoneInputs?: Json
  milestoneIndex?: number
  milestoneQuestionIndex?: number
  serviceSuggestions?: Json
  generatedCampaigns?: Json
  needCount?: number | null
  needsData?: Json
  activeNeedIndex?: number
  activeNeedQuestionIndex?: number
  selectedOfferIdsByNeed?: Json
  generatedDraft?: Json
  draftCampaignId?: string | null
  leadNgoInvites?: Json
  invitedOfferIds?: Json
  selectedProjectSuggestionId?: string | null
}

type SessionStateRow = Partial<Tables<"csr_ai_agent_session_state"> & Tables<"ngo_ai_agent_session_state">>

type SessionMessage = {
  role: string
  content: string
  meta: Json
  createdAt: string
}

type PersistedPayload = {
  sessions: PersistedSession[]
  activeSessionId?: string
  updatedAt?: string
}

const toNumberOr = (value: unknown, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const buildStateFromSession = (agent: AgentKind, session: PersistedSession) => {
  const sessionState: PersistedSessionState = session?.state || session?.session_state || {}
  const incomingUiState: JsonObject = (sessionState?.ui_state && typeof sessionState.ui_state === "object") ? sessionState.ui_state : {}

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
        draftCampaignId: session?.draftCampaignId ?? incomingUiState?.draftCampaignId ?? null,
        leadNgoInvites: session?.leadNgoInvites ?? incomingUiState?.leadNgoInvites ?? [],
        invitedOfferIds: session?.invitedOfferIds ?? incomingUiState?.invitedOfferIds ?? [],
        selectedProjectSuggestionId: session?.selectedProjectSuggestionId ?? incomingUiState?.selectedProjectSuggestionId ?? null,
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

type BuiltSessionState = ReturnType<typeof buildStateFromSession>

async function upsertSessionState(
  agent: AgentKind,
  sessionId: string,
  state: BuiltSessionState,
  uiState: JsonObject,
  updatedAt: string
) {
  const shared = {
    session_id: sessionId,
    conversation_stage: state.conversation_stage || undefined,
    project_data: state.project_data || {},
    ui_state: uiState,
    updated_at: updatedAt,
  }

  if (agent === "csr") {
    return supabase.from("csr_ai_agent_session_state").upsert(
      {
        ...shared,
        milestone_count: state.milestone_count ?? null,
        milestone_inputs: state.milestone_inputs || [],
        service_suggestions: state.service_suggestions || [],
        generated_campaigns: state.generated_campaigns || [],
      },
      { onConflict: "session_id" }
    )
  }

  return supabase.from("ngo_ai_agent_session_state").upsert(
    {
      ...shared,
      needs_data: state.needs_data || [],
      generated_draft: state.generated_draft || null,
      selected_offer_ids_by_need: state.selected_offer_ids_by_need || {},
    },
    { onConflict: "session_id" }
  )
}

const keyByAgent: Record<AgentKind, string> = {
  csr: "csr_ai_agent_progress",
  ngo: "ngo_ai_agent_progress",
}

const parseAgent = (value: unknown): AgentKind | null => {
  if (value === "csr" || value === "ngo") return value
  return null
}

const isValidUUID = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)

/** Legacy non-UUID client ids map to a name-based (v5-style) UUID so repeated saves hit the same row. */
function resolveSessionRowId(agent: AgentKind, userId: number, clientId: string): string {
  if (isValidUUID(clientId)) return clientId
  const hash = createHash('sha1').update(`navadrishti:${agent}:${userId}:${clientId}`).digest()
  hash[6] = (hash[6] & 0x0f) | 0x50
  hash[8] = (hash[8] & 0x3f) | 0x80
  const hex = hash.subarray(0, 16).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

/** Drops rows whose id already belongs to another user so a client cannot overwrite their sessions. */
async function filterOwnedSessionRows<T extends { id: string }>(table: string, userId: number, rows: T[]) {
  if (rows.length === 0) return rows
  const { data, error } = await supabase
    .from(table as "csr_ai_agent_sessions")
    .select("id, user_id")
    .in("id", rows.map((row) => row.id))
  if (error) throw error
  const foreign = new Set((data || []).filter((row) => Number(row.user_id) !== Number(userId)).map((row) => String(row.id)))
  return rows.filter((row) => !foreign.has(row.id))
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
    .neq("status", "archived")
    .order("updated_at", { ascending: false })

  if (error) throw error

  const sessionIds = (rows || []).map((r) => r.id)
  const { data: stateRows } = await supabase.from(stateTable).select("*").in("session_id", sessionIds)
  const stateBySession: Record<string, SessionStateRow> = {}
  for (const s of stateRows || []) stateBySession[s.session_id] = s

  const messagesTable = agent === "csr" ? "csr_ai_agent_messages" : "ngo_ai_agent_messages"
  const { data: messageRows } = await supabase
    .from(messagesTable)
    .select("session_id, role, content, meta, created_at")
    .in("session_id", sessionIds)
    .order("created_at", { ascending: true })

  const messagesBySession: Record<string, SessionMessage[]> = {}
  for (const m of messageRows || []) {
    messagesBySession[m.session_id] = messagesBySession[m.session_id] || []
    messagesBySession[m.session_id].push({ role: m.role, content: m.content, meta: m.meta, createdAt: m.created_at })
  }

  const sessions = (rows || []).map((r) => {
    const state = stateBySession[r.id] || {}
    const uiState: JsonObject =
      state.ui_state && typeof state.ui_state === "object" && !Array.isArray(state.ui_state) ? state.ui_state : {}
    const projectContext =
      r.project_context && typeof r.project_context === "object" ? r.project_context : {}
    const published = readPublishedEntity(projectContext)
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
        draftCampaignId: typeof uiState.draftCampaignId === "string" ? uiState.draftCampaignId : null,
        leadNgoInvites: Array.isArray(uiState.leadNgoInvites) ? uiState.leadNgoInvites : [],
        invitedOfferIds: Array.isArray(uiState.invitedOfferIds) ? uiState.invitedOfferIds : [],
        selectedProjectSuggestionId:
          typeof uiState.selectedProjectSuggestionId === "string" ? uiState.selectedProjectSuggestionId : null,
        publishedCampaignId:
          published?.type === "campaign"
            ? published.id
            : (projectContext as Record<string, unknown>).published_campaign_id ?? null,
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
      publishedProjectId:
        published?.type === "project"
          ? published.id
          : (projectContext as Record<string, unknown>).published_project_id ?? null,
    }
  })

  const updatedAt = sessions.reduce((acc: string | null, s) => {
    return acc === null || (s.updatedAt && new Date(s.updatedAt) > new Date(acc)) ? s.updatedAt : acc
  }, null as string | null)

  const profileData = await readProfileData(userId)
  const key = keyByAgent[agent]
  const legacy = profileData[key] as PersistedPayload | undefined

  return {
    sessions,
    activeSessionId: legacy?.activeSessionId ?? null,
    updatedAt: updatedAt || new Date().toISOString(),
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = findAuthUser(request, { allowCookie: true })?.id
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
    const userId = findAuthUser(request, { allowCookie: true })?.id
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
    const messagesTable = agent === "csr" ? "csr_ai_agent_messages" : "ngo_ai_agent_messages"

    // Compute server latest timestamp
    const { data: existingSessions } = await supabase
      .from(sessionsTable)
      .select("updated_at")
      .eq("user_id", userId)

    const serverUpdatedAt = Array.isArray(existingSessions) && existingSessions.length > 0
      ? existingSessions.reduce((acc: string | null, r) => acc === null || (r.updated_at && new Date(r.updated_at) > new Date(acc)) ? r.updated_at : acc, null as string | null)
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
        const legacySessions = legacy && Array.isArray(legacy.sessions)
          ? legacy.sessions.filter((s) => s && typeof s.id === 'string' && s.id)
          : []
        if (legacy && legacySessions.length > 0) {
          const candidates: Array<TablesInsert<"csr_ai_agent_sessions"> & { id: string }> = []
          for (const s of legacySessions) {
            candidates.push({
              id: resolveSessionRowId(agent, userId, s.id),
              user_id: userId,
              title: s.title || "Untitled session",
              status: s.status || "active",
              project_context: s.project_context || {},
              created_at: s.createdAt || new Date().toISOString(),
              updated_at: legacy.updatedAt || new Date().toISOString(),
              last_message_at: s.lastMessageAt || null,
            })
          }

          const toInsert = await filterOwnedSessionRows(sessionsTable, userId, candidates)
          const migratedIds = new Set(toInsert.map((row) => row.id))

          const { error: upsertErr } = await supabase.from(sessionsTable).upsert(toInsert, { onConflict: 'id' })
          if (upsertErr) console.warn('Migration upsert sessions error', upsertErr)

          const legacyMessageRows: TablesInsert<"csr_ai_agent_messages">[] = []
          for (const s of legacySessions) {
            const origId = s.id
            const idToUse = resolveSessionRowId(agent, userId, origId)
            if (!migratedIds.has(idToUse)) continue
            if (s.state || s.session_state || s.projectData || s.project_context || s.conversationStage) {
              const state = buildStateFromSession(agent, s)
              const ui_state: JsonObject = state.ui_state || {}
              if (!isValidUUID(origId) && origId) ui_state.legacyId = origId
              await upsertSessionState(agent, idToUse, state, ui_state, legacy.updatedAt || new Date().toISOString())
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
    const incomingSessions = normalizedPayload.sessions.filter((s) => s && typeof s.id === 'string' && s.id)
    const candidateRows = incomingSessions.map((s) => {
      const existingContext =
        s.project_context && typeof s.project_context === "object" ? s.project_context : {}
      return {
        id: resolveSessionRowId(agent, userId, s.id),
        user_id: userId,
        title: s.title || "Untitled session",
        status: s.status || "active",
        project_context: buildProjectContextWithPublished(s, existingContext as Record<string, unknown>),
        created_at: s.createdAt || new Date().toISOString(),
        updated_at: normalizedPayload.updatedAt || new Date().toISOString(),
        last_message_at: s.lastMessageAt || null,
      }
    })

    const sessionRows = await filterOwnedSessionRows(sessionsTable, userId, candidateRows)
    const ownedIds = new Set(sessionRows.map((row) => row.id))

    if (sessionRows.length > 0) {
      const { error: upsertSessionsError } = await supabase.from(sessionsTable).upsert(sessionRows, { onConflict: 'id' })
      if (upsertSessionsError) throw upsertSessionsError
    }

    const messageRows: TablesInsert<"csr_ai_agent_messages">[] = []
    for (const s of incomingSessions) {
      const assignedId = resolveSessionRowId(agent, userId, s.id)
      if (!ownedIds.has(assignedId)) continue
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
      const assignedId = resolveSessionRowId(agent, userId, origId)
      if (!ownedIds.has(assignedId)) continue
      const state = buildStateFromSession(agent, s)
      const ui_state: JsonObject = state.ui_state || {}
      if (!isValidUUID(origId) && origId) ui_state.legacyId = origId
      const { error: upsertStateErr } = await upsertSessionState(
        agent,
        assignedId,
        state,
        ui_state,
        normalizedPayload.updatedAt || new Date().toISOString()
      )
      if (upsertStateErr) console.warn('Failed to upsert session state', upsertStateErr)
    }

    await pruneRemovedAgentSessions(agent, userId, sessionRows.map((row) => String(row.id)))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to save AI agent progress", error)
    return NextResponse.json({ error: "Failed to save AI agent progress" }, { status: 500 })
  }
}
