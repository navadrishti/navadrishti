import { useCallback, useEffect, useRef, useState } from "react"
import type { CloudSaveStatus } from "./conversation"
import {
  type NGOAIAgentSession,
  buildEmptySession,
  hasMeaningfulNGOSessionContent,
  normalizeSessionPayload,
  sessionPayloadScore,
} from "./intake"

type SessionSyncOptions = {
  mounted: boolean
  userId?: number
  token: string | null
}

export function useSessionSync({ mounted, userId, token }: SessionSyncOptions) {
  const [sessions, setSessions] = useState<NGOAIAgentSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState('')
  const [cloudSaveStatus, setCloudSaveStatus] = useState<CloudSaveStatus>('idle')
  const [lastCloudSavedAt, setLastCloudSavedAt] = useState<string | null>(null)
  const isHydratingFromServerRef = useRef(false)
  const serverPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastPersistedServerPayloadRef = useRef('')
  const pendingServerPayloadRef = useRef<string | null>(null)
  const serverRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isServerSyncInFlightRef = useRef(false)

  const persistSessions = (nextSessions: NGOAIAgentSession[], nextActiveId?: string) => {
    setSessions(nextSessions)
    const storageKey = userId ? `nd_ngo_ai_agent_sessions_${userId}` : undefined
    if (!storageKey || !userId) return
    const meaningful = nextSessions.filter(hasMeaningfulNGOSessionContent)
    if (meaningful.length === 0) {
      try {
        localStorage.removeItem(storageKey)
        localStorage.removeItem(`nd_ngo_ai_agent_pending_${userId}`)
      } catch {}
      pendingServerPayloadRef.current = null
      lastPersistedServerPayloadRef.current = ''
      setCloudSaveStatus('saved')
      return
    }
    const activeCandidate = nextActiveId || activeSessionId || meaningful[0].id
    const payload = { sessions: meaningful, activeSessionId: meaningful.some((s) => s.id === activeCandidate) ? activeCandidate : meaningful[0].id }
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
      localStorage.setItem(`nd_ngo_ai_agent_pending_${userId}`, serialized)
    } catch {}

    if (serverPersistTimerRef.current) clearTimeout(serverPersistTimerRef.current)
    setCloudSaveStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'saving')
    serverPersistTimerRef.current = setTimeout(() => {
      void syncPendingServerProgress()
    }, 700)
  }

  const syncPendingServerProgress = useCallback(async () => {
    if (!userId) return
    if (isServerSyncInFlightRef.current) return

    const pending = pendingServerPayloadRef.current
    if (!pending || pending === lastPersistedServerPayloadRef.current) return

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setCloudSaveStatus('offline')
      if (!serverRetryTimerRef.current) {
        serverRetryTimerRef.current = setTimeout(() => {
          serverRetryTimerRef.current = null
          void syncPendingServerProgress()
        }, 2500)
      }
      return
    }

    isServerSyncInFlightRef.current = true
    setCloudSaveStatus('saving')

    try {
      const payloadObject = JSON.parse(pending)
      const response = await fetch('/api/ai-agent/progress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ agent: 'ngo', data: payloadObject }),
      })

      if (response.ok) {
        lastPersistedServerPayloadRef.current = pending
        pendingServerPayloadRef.current = null
        try {
          localStorage.removeItem(`nd_ngo_ai_agent_pending_${userId}`)
        } catch {}
        setCloudSaveStatus('saved')
        setLastCloudSavedAt(new Date().toISOString())
        return
      }

      if (response.status === 409) {
        const body = await response.json().catch(() => null)
        const latest = normalizeSessionPayload<NGOAIAgentSession>(body?.latest)
        if (latest && latest.sessions.length > 0) {
          const mergedPayload = {
            sessions: latest.sessions,
            activeSessionId: latest.activeSessionId || latest.sessions[0].id,
            updatedAt: body?.latest?.updatedAt || new Date().toISOString(),
          }
          setSessions(mergedPayload.sessions)
          setActiveSessionId(mergedPayload.activeSessionId)
          try {
            localStorage.setItem(`nd_ngo_ai_agent_sessions_${userId}`, JSON.stringify({ sessions: mergedPayload.sessions, activeSessionId: mergedPayload.activeSessionId }))
            localStorage.removeItem(`nd_ngo_ai_agent_pending_${userId}`)
          } catch {}
          const mergedSerialized = JSON.stringify(mergedPayload)
          lastPersistedServerPayloadRef.current = mergedSerialized
          pendingServerPayloadRef.current = null
          setCloudSaveStatus('saved')
          setLastCloudSavedAt(new Date().toISOString())
          return
        }
      }

      throw new Error(`Cloud save failed: ${response.status}`)
    } catch {
      setCloudSaveStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'error')
      if (!serverRetryTimerRef.current) {
        serverRetryTimerRef.current = setTimeout(() => {
          serverRetryTimerRef.current = null
          void syncPendingServerProgress()
        }, 3000)
      }
    } finally {
      isServerSyncInFlightRef.current = false
    }
  }, [token, userId])

  useEffect(() => {
    if (!mounted || !userId) return

    try {
      const pending = localStorage.getItem(`nd_ngo_ai_agent_pending_${userId}`)
      if (pending) {
        pendingServerPayloadRef.current = pending
        setCloudSaveStatus('saving')
        void syncPendingServerProgress()
      }
    } catch {}

    const handleOnline = () => {
      setCloudSaveStatus('saving')
      void syncPendingServerProgress()
    }

    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener('online', handleOnline)
      if (serverRetryTimerRef.current) {
        clearTimeout(serverRetryTimerRef.current)
        serverRetryTimerRef.current = null
      }
    }
  }, [mounted, syncPendingServerProgress, userId])

  useEffect(() => {
    if (!mounted || !userId) return

    let cancelled = false
    const returnOnNextMountKey = `nd_ngo_ai_agent_return_new_${userId}`
    const unloadingKey = `nd_ngo_ai_agent_unloading_${userId}`
    const markUnloading = () => {
      try {
        sessionStorage.setItem(unloadingKey, '1')
      } catch {}
    }
    let shouldStartFreshOnReturn = false
    try {
      shouldStartFreshOnReturn = sessionStorage.getItem(returnOnNextMountKey) === '1'
      sessionStorage.removeItem(returnOnNextMountKey)
      sessionStorage.removeItem(unloadingKey)
    } catch {}

    window.addEventListener('beforeunload', markUnloading)

    const hydrate = async () => {
      isHydratingFromServerRef.current = true
      const storageKey = `nd_ngo_ai_agent_sessions_${userId}`
      const readPayload = (raw: string | null) => {
        if (!raw) return null
        try {
          return normalizeSessionPayload<NGOAIAgentSession>(JSON.parse(raw))
        } catch {
          return null
        }
      }
      const localPayload = readPayload(localStorage.getItem(storageKey))

      try {
        const response = await fetch('/api/ai-agent/progress?agent=ngo', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          credentials: 'include',
        })
        if (!cancelled && response.ok) {
          const result = await response.json()
          const serverPayload = normalizeSessionPayload<NGOAIAgentSession>(result?.data)
          if (serverPayload && serverPayload.sessions.length > 0) {
            const useLocalFallback = localPayload && sessionPayloadScore(localPayload) > sessionPayloadScore(serverPayload)
            const sourcePayload = useLocalFallback && localPayload
              ? {
                  sessions: localPayload.sessions,
                  activeSessionId: localPayload.activeSessionId || localPayload.sessions[0].id,
                }
              : {
                  sessions: serverPayload.sessions,
                  activeSessionId: serverPayload.activeSessionId || serverPayload.sessions[0].id,
                }

            const payload = shouldStartFreshOnReturn
              ? (() => {
                  const fresh = buildEmptySession()
                  return { sessions: [fresh, ...sourcePayload.sessions], activeSessionId: fresh.id }
                })()
              : sourcePayload

            setSessions(payload.sessions)
            setActiveSessionId(payload.activeSessionId)
            if (!shouldStartFreshOnReturn) {
              try {
                localStorage.setItem(storageKey, JSON.stringify(payload))
              } catch {}
              lastPersistedServerPayloadRef.current = JSON.stringify(payload)
            }
            return
          }
        }
      } catch {}

      if (localPayload && localPayload.sessions.length > 0) {
        const sourcePayload = {
          sessions: localPayload.sessions,
          activeSessionId: localPayload.activeSessionId || localPayload.sessions[0].id,
        }
        const payload = shouldStartFreshOnReturn
          ? (() => {
              const fresh = buildEmptySession()
              return { sessions: [fresh, ...sourcePayload.sessions], activeSessionId: fresh.id }
            })()
          : sourcePayload
        setSessions(payload.sessions)
        setActiveSessionId(payload.activeSessionId)
        return
      }

      const initial = buildEmptySession()
      setSessions([initial])
      setActiveSessionId(initial.id)
    }

    void hydrate().finally(() => {
      setTimeout(() => {
        isHydratingFromServerRef.current = false
      }, 0)
    })

    return () => {
      window.removeEventListener('beforeunload', markUnloading)
      try {
        const isHardUnload = sessionStorage.getItem(unloadingKey) === '1'
        if (isHardUnload) {
          sessionStorage.removeItem(unloadingKey)
          sessionStorage.removeItem(returnOnNextMountKey)
        } else {
          sessionStorage.setItem(returnOnNextMountKey, '1')
        }
      } catch {}
      cancelled = true
    }
  }, [mounted, token, userId])

  return {
    sessions,
    setSessions,
    activeSessionId,
    setActiveSessionId,
    cloudSaveStatus,
    lastCloudSavedAt,
    persistSessions,
    isHydratingFromServerRef,
  }
}
