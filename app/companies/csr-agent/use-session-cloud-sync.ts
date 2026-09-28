import { useCallback, useEffect, useRef, useState } from "react"
import { type CloudSaveStatus, describeCloudSaveStatus } from "@/lib/cloud-save-status"
import { type CSRAgentSession, hasMeaningfulSessionContent, normalizeSessionPayload } from "./session"

type SessionCloudSyncOptions = {
  mounted: boolean
  userId: number | undefined
  token: string | null | undefined
  activeSessionId: string
  setSessions: (sessions: CSRAgentSession[]) => void
  setActiveSessionId: (sessionId: string) => void
}

export function useSessionCloudSync({ mounted, userId, token, activeSessionId, setSessions, setActiveSessionId }: SessionCloudSyncOptions) {
  const [cloudSaveStatus, setCloudSaveStatus] = useState<CloudSaveStatus>("idle")
  const [lastCloudSavedAt, setLastCloudSavedAt] = useState<string | null>(null)
  const serverPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastPersistedServerPayloadRef = useRef("")
  const pendingServerPayloadRef = useRef<string | null>(null)
  const serverRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isServerSyncInFlightRef = useRef(false)
  const syncPendingServerProgressRef = useRef<() => Promise<void>>(async () => {})

  const scheduleServerRetry = useCallback((delayMs: number) => {
    if (serverRetryTimerRef.current) return
    serverRetryTimerRef.current = setTimeout(() => {
      serverRetryTimerRef.current = null
      void syncPendingServerProgressRef.current()
    }, delayMs)
  }, [])

  const syncPendingServerProgress = useCallback(async () => {
    if (!userId) return
    if (isServerSyncInFlightRef.current) return

    const pending = pendingServerPayloadRef.current
    if (!pending || pending === lastPersistedServerPayloadRef.current) return

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setCloudSaveStatus("offline")
      scheduleServerRetry(2500)
      return
    }

    isServerSyncInFlightRef.current = true
    setCloudSaveStatus("saving")

    try {
      const payloadObject = JSON.parse(pending)
      const response = await fetch("/api/ai-agent/progress", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ agent: "csr", data: payloadObject }),
      })

      if (response.ok) {
        lastPersistedServerPayloadRef.current = pending
        pendingServerPayloadRef.current = null
        try {
          localStorage.removeItem(`nd_csr_ai_agent_pending_${userId}`)
        } catch {}
        setCloudSaveStatus("saved")
        setLastCloudSavedAt(new Date().toISOString())
        return
      }

      if (response.status === 409) {
        const body = await response.json().catch(() => null)
        const latest = normalizeSessionPayload<CSRAgentSession>(body?.latest)
        if (latest && latest.sessions.length > 0) {
          const mergedPayload = {
            sessions: latest.sessions,
            activeSessionId: latest.activeSessionId || latest.sessions[0].id,
            updatedAt: body?.latest?.updatedAt || new Date().toISOString(),
          }
          setSessions(mergedPayload.sessions)
          setActiveSessionId(mergedPayload.activeSessionId)
          try {
            localStorage.setItem(`nd_csr_ai_agent_sessions_${userId}`, JSON.stringify({ sessions: mergedPayload.sessions, activeSessionId: mergedPayload.activeSessionId }))
            localStorage.removeItem(`nd_csr_ai_agent_pending_${userId}`)
          } catch {}
          const mergedSerialized = JSON.stringify(mergedPayload)
          lastPersistedServerPayloadRef.current = mergedSerialized
          pendingServerPayloadRef.current = null
          setCloudSaveStatus("saved")
          setLastCloudSavedAt(new Date().toISOString())
          return
        }
      }

      throw new Error(`Cloud save failed: ${response.status}`)
    } catch {
      setCloudSaveStatus(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "error")
      scheduleServerRetry(3000)
    } finally {
      isServerSyncInFlightRef.current = false
    }
  }, [token, userId, setSessions, setActiveSessionId, scheduleServerRetry])

  useEffect(() => {
    syncPendingServerProgressRef.current = syncPendingServerProgress
  }, [syncPendingServerProgress])

  const persistSessions = (nextSessions: CSRAgentSession[], nextActiveId?: string) => {
    setSessions(nextSessions)
    const storageUserId = userId
    if (!storageUserId) return
    const storageKey = `nd_csr_ai_agent_sessions_${storageUserId}`
    const meaningfulSessions = nextSessions.filter(hasMeaningfulSessionContent)
    if (meaningfulSessions.length === 0) {
      try {
        localStorage.removeItem(storageKey)
        localStorage.removeItem(`nd_csr_ai_agent_pending_${storageUserId}`)
      } catch {}
      pendingServerPayloadRef.current = null
      lastPersistedServerPayloadRef.current = ""
      setCloudSaveStatus("saved")
      return
    }
    const activeCandidate = nextActiveId || activeSessionId || meaningfulSessions[0].id
    const payload = { sessions: meaningfulSessions, activeSessionId: meaningfulSessions.some((session) => session.id === activeCandidate) ? activeCandidate : meaningfulSessions[0].id }
    try {
      localStorage.setItem(storageKey, JSON.stringify(payload))
    } catch {}

    const payloadForServer = {
      ...payload,
      updatedAt: new Date().toISOString(),
    }

    const serialized = JSON.stringify(payloadForServer)
    pendingServerPayloadRef.current = serialized
    try {
      localStorage.setItem(`nd_csr_ai_agent_pending_${storageUserId}`, serialized)
    } catch {}

    if (serverPersistTimerRef.current) clearTimeout(serverPersistTimerRef.current)
    setCloudSaveStatus(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "saving")
    serverPersistTimerRef.current = setTimeout(() => {
      void syncPendingServerProgress()
    }, 700)
  }

  useEffect(() => {
    if (!mounted || !userId) return

    try {
      const pending = localStorage.getItem(`nd_csr_ai_agent_pending_${userId}`)
      if (pending) {
        pendingServerPayloadRef.current = pending
        setCloudSaveStatus("saving")
        void syncPendingServerProgress()
      }
    } catch {}

    const handleOnline = () => {
      setCloudSaveStatus("saving")
      void syncPendingServerProgress()
    }

    window.addEventListener("online", handleOnline)
    return () => {
      window.removeEventListener("online", handleOnline)
      if (serverRetryTimerRef.current) {
        clearTimeout(serverRetryTimerRef.current)
        serverRetryTimerRef.current = null
      }
    }
  }, [mounted, syncPendingServerProgress, userId])

  const cloudSaveText = describeCloudSaveStatus(cloudSaveStatus, lastCloudSavedAt)

  const markPayloadPersisted = (serialized: string) => {
    lastPersistedServerPayloadRef.current = serialized
  }

  return { persistSessions, cloudSaveText, markPayloadPersisted }
}
