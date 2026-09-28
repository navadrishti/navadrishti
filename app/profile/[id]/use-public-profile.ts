"use client"

import { useEffect, useState } from "react"
import { getErrorMessage } from "@/lib/utils"
import type { UserProfile, ViewingDocument } from "./types"

export function usePublicProfile(id: string) {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewingDoc, setViewingDoc] = useState<ViewingDocument | null>(null)

  useEffect(() => {
    let cancelled = false

    const fetchProfileData = async () => {
      try {
        setLoading(true)
        setError(null)

        const token = localStorage.getItem("token")
        const profileRes = await fetch(`/api/profile/${id}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        const profileData = await profileRes.json()
        if (cancelled) return

        if (!profileRes.ok || !profileData.success) {
          setError(profileData.error || "Profile not found")
          return
        }

        setProfile(profileData.profile)
      } catch (err) {
        if (cancelled) return
        console.error("Profile fetch error:", err)
        setError(getErrorMessage(err) || "Failed to load profile")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    if (id) {
      setViewingDoc(null)
      fetchProfileData()
    }

    return () => {
      cancelled = true
    }
  }, [id])

  return { profile, loading, error, viewingDoc, setViewingDoc }
}
