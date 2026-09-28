"use client"

import { useCallback, useEffect, useState } from "react"
import type { NetworkNgo } from "./types"

export function useRecommendedNgos(userId: number | undefined) {
  const [recommended, setRecommended] = useState<NetworkNgo[]>([])
  const [loadingRecommended, setLoadingRecommended] = useState(false)
  const [refreshingRecommended, setRefreshingRecommended] = useState(false)

  const fetchRecommended = useCallback(async (opts?: { refresh?: boolean }) => {
    if (!userId) {
      setRecommended([])
      return
    }

    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null
    if (!token) {
      setRecommended([])
      return
    }

    const isRefresh = Boolean(opts?.refresh)
    if (isRefresh) setRefreshingRecommended(true)
    else setLoadingRecommended(true)

    try {
      const params = new URLSearchParams({
        recommend: "1",
        verified_only: "true",
        shuffle: "1",
      })
      const response = await fetch(`/api/ngos/network?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json()
      if (response.ok && data?.success) {
        setRecommended(Array.isArray(data.recommended) ? data.recommended : [])
      } else {
        setRecommended([])
      }
    } catch {
      setRecommended([])
    } finally {
      if (isRefresh) setRefreshingRecommended(false)
      else setLoadingRecommended(false)
    }
  }, [userId])

  useEffect(() => {
    fetchRecommended()
  }, [fetchRecommended])

  return { recommended, loadingRecommended, refreshingRecommended, fetchRecommended }
}

export type RecommendedNgosState = ReturnType<typeof useRecommendedNgos>
