import { useEffect, useEffectEvent, useRef } from "react"
import { openAgentSessionList } from "@/lib/ai-agent-sessions"
import { readStoredSessionPayload, sessionPayloadScore } from "./helpers"
import { type CSRAgentSession, buildEmptySession, hasMeaningfulSessionContent, normalizeSessionPayload } from "./session"

type SessionHydrationOptions = {
  mounted: boolean
  userId: number | undefined
  token: string | null
  sessions: CSRAgentSession[]
  activeSessionId: string
  setSessions: (sessions: CSRAgentSession[]) => void
  setActiveSessionId: (sessionId: string) => void
  applySession: (session: CSRAgentSession, nextSessions: CSRAgentSession[], persistSelection: boolean) => void
  markPayloadPersisted: (serialized: string) => void
}

export function useSessionHydration({
  mounted,
  userId,
  token,
  sessions,
  activeSessionId,
  setSessions,
  setActiveSessionId,
  applySession,
  markPayloadPersisted,
}: SessionHydrationOptions) {
  const isHydratingFromServerRef = useRef(false)
  const tokenRef = useRef(token)
  const sessionsRef = useRef(sessions)
  const activeSessionIdRef = useRef(activeSessionId)
  tokenRef.current = token
  sessionsRef.current = sessions
  activeSessionIdRef.current = activeSessionId

  const showSessions = useEffectEvent((nextSessions: CSRAgentSession[], nextActiveId: string) => {
    setSessions(nextSessions)
    setActiveSessionId(nextActiveId)
  })

  const restoreSessions = useEffectEvent((nextSessions: CSRAgentSession[], nextActiveId: string) => {
    showSessions(nextSessions, nextActiveId)
    const active = nextSessions.find((s) => s.id === nextActiveId) || nextSessions[0]
    if (active) applySession(active, nextSessions, false)
  })

  const markRestoredPayloadPersisted = useEffectEvent(markPayloadPersisted)

  useEffect(() => {
    if (!mounted || !userId) return

    let cancelled = false
    const returnOnNextMountKey = `nd_csr_ai_agent_return_new_${userId}`
    const unloadingKey = `nd_csr_ai_agent_unloading_${userId}`
    const markUnloading = () => {
      try {
        sessionStorage.setItem(unloadingKey, "1")
      } catch {}
    }
    let shouldStartFreshOnReturn = false
    try {
      shouldStartFreshOnReturn = sessionStorage.getItem(returnOnNextMountKey) === "1"
      sessionStorage.removeItem(returnOnNextMountKey)
      sessionStorage.removeItem(unloadingKey)
    } catch {}

    window.addEventListener("beforeunload", markUnloading)

    const hydrate = async () => {
      isHydratingFromServerRef.current = true
      const storageKey = `nd_csr_ai_agent_sessions_${userId}`
      const localPayload = readStoredSessionPayload(localStorage.getItem(storageKey))
      const authToken = tokenRef.current

      const openFrom = (stored: CSRAgentSession[], storedActiveId?: string) =>
        openAgentSessionList(stored, buildEmptySession(), {
          startFresh: shouldStartFreshOnReturn || !activeSessionIdRef.current,
          current: sessionsRef.current,
          preferredId: activeSessionIdRef.current,
          storedActiveId,
          isMeaningful: hasMeaningfulSessionContent,
        })

      try {
        const response = await fetch("/api/ai-agent/progress?agent=csr", {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
          credentials: "include",
        })

        if (!cancelled && response.ok) {
          const result = await response.json()
          const serverPayload = normalizeSessionPayload<CSRAgentSession>(result?.data)
          if (serverPayload && serverPayload.sessions.length > 0) {
            const useLocalFallback = localPayload && sessionPayloadScore(localPayload) > sessionPayloadScore(serverPayload)
            const sourcePayload = useLocalFallback && localPayload
              ? { sessions: localPayload.sessions, activeSessionId: localPayload.activeSessionId || localPayload.sessions[0].id }
              : { sessions: serverPayload.sessions, activeSessionId: serverPayload.activeSessionId || serverPayload.sessions[0].id }
            const payload = openFrom(sourcePayload.sessions, sourcePayload.activeSessionId)
            restoreSessions(payload.sessions, payload.activeSessionId)
            if (!shouldStartFreshOnReturn) {
              try {
                localStorage.setItem(storageKey, JSON.stringify(payload))
              } catch {}
              markRestoredPayloadPersisted(JSON.stringify(payload))
            }
            return
          }
        }

        if (localPayload && localPayload.sessions.length > 0) {
          const payload = openFrom(localPayload.sessions, localPayload.activeSessionId || localPayload.sessions[0].id)
          restoreSessions(payload.sessions, payload.activeSessionId)
          return
        }

        if (sessionsRef.current.length > 0) return

        const initial = buildEmptySession()
        showSessions([initial], initial.id)
      } finally {
        if (!cancelled) isHydratingFromServerRef.current = false
      }
    }

    void hydrate()

    return () => {
      window.removeEventListener("beforeunload", markUnloading)
      try {
        const isHardUnload = sessionStorage.getItem(unloadingKey) === "1"
        if (isHardUnload) {
          sessionStorage.removeItem(unloadingKey)
          sessionStorage.removeItem(returnOnNextMountKey)
        } else {
          sessionStorage.setItem(returnOnNextMountKey, "1")
        }
      } catch {}
      cancelled = true
    }
  }, [mounted, userId])

  return isHydratingFromServerRef
}
