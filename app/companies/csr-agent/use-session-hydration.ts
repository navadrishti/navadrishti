import { useEffect, useRef } from "react"
import { readStoredSessionPayload, sessionPayloadScore, withFreshSessionFirst } from "./helpers"
import { type CSRAgentSession, buildEmptySession, normalizeSessionPayload } from "./session"

type SessionHydrationOptions = {
  mounted: boolean
  userId: number | undefined
  token: string | null
  setSessions: (sessions: CSRAgentSession[]) => void
  setActiveSessionId: (sessionId: string) => void
  applySession: (session: CSRAgentSession, nextSessions: CSRAgentSession[], persistSelection: boolean) => void
  markPayloadPersisted: (serialized: string) => void
}

export function useSessionHydration({
  mounted,
  userId,
  token,
  setSessions,
  setActiveSessionId,
  applySession,
  markPayloadPersisted,
}: SessionHydrationOptions) {
  const isHydratingFromServerRef = useRef(false)

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

      try {
        const response = await fetch("/api/ai-agent/progress?agent=csr", {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
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
            const payload = shouldStartFreshOnReturn ? withFreshSessionFirst(sourcePayload) : sourcePayload
            setSessions(payload.sessions)
            setActiveSessionId(payload.activeSessionId)
            const active = payload.sessions.find((s) => s.id === payload.activeSessionId) || payload.sessions[0]
            if (active) applySession(active, payload.sessions, false)
            if (!shouldStartFreshOnReturn) {
              try {
                localStorage.setItem(storageKey, JSON.stringify(payload))
              } catch {}
              markPayloadPersisted(JSON.stringify(payload))
            }
            return
          }
        }

        if (localPayload && localPayload.sessions.length > 0) {
          const sourcePayload = {
            sessions: localPayload.sessions,
            activeSessionId: localPayload.activeSessionId || localPayload.sessions[0].id,
          }
          const payload = shouldStartFreshOnReturn ? withFreshSessionFirst(sourcePayload) : sourcePayload
          setSessions(payload.sessions)
          setActiveSessionId(payload.activeSessionId)
          const active = payload.sessions.find((s) => s.id === payload.activeSessionId) || payload.sessions[0]
          if (active) applySession(active, payload.sessions, false)
          return
        }

        const initial = buildEmptySession()
        setSessions([initial])
        setActiveSessionId(initial.id)
      } finally {
        isHydratingFromServerRef.current = false
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
  }, [mounted, token, userId])

  return isHydratingFromServerRef
}
