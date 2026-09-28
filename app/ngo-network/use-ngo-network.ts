"use client"

import { useEffect, useState } from "react"
import type { NetworkNgo } from "./types"

export function useNgoNetwork() {
  const [ngos, setNgos] = useState<NetworkNgo[]>([])
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [location, setLocation] = useState("")
  const [selectedSector, setSelectedSector] = useState("all")
  const [selectedCompliance, setSelectedCompliance] = useState("all")
  const [selectedRegistration, setSelectedRegistration] = useState("all")
  const [verifiedOnly, setVerifiedOnly] = useState(true)
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [debouncedLocation, setDebouncedLocation] = useState("")

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim())
      setDebouncedLocation(location.trim())
    }, 300)
    return () => clearTimeout(timer)
  }, [search, location])

  const params = new URLSearchParams()
  if (debouncedSearch) params.set("search", debouncedSearch)
  if (debouncedLocation) params.set("location", debouncedLocation)
  if (selectedSector !== "all") params.set("sector", selectedSector)
  if (selectedCompliance !== "all") params.set("compliance", selectedCompliance)
  if (selectedRegistration !== "all") params.set("registration_type", selectedRegistration)
  params.set("verified_only", verifiedOnly ? "true" : "false")
  const query = params.toString()
  const loading = loadedQuery !== query

  useEffect(() => {
    let cancelled = false
    fetch(`/api/ngos/network?${query}`)
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return
        setNgos(data.success && Array.isArray(data.ngos) ? data.ngos : [])
      })
      .catch(() => {
        if (!cancelled) setNgos([])
      })
      .finally(() => {
        if (!cancelled) setLoadedQuery(query)
      })

    return () => {
      cancelled = true
    }
  }, [query])

  const hasActiveFilters = Boolean(
    debouncedSearch ||
    debouncedLocation ||
    selectedSector !== "all" ||
    selectedCompliance !== "all" ||
    selectedRegistration !== "all"
  )

  const clearFilters = () => {
    setSearch("")
    setLocation("")
    setDebouncedSearch("")
    setDebouncedLocation("")
    setSelectedSector("all")
    setSelectedCompliance("all")
    setSelectedRegistration("all")
  }

  return {
    ngos,
    loading,
    search,
    setSearch,
    location,
    setLocation,
    selectedSector,
    setSelectedSector,
    selectedCompliance,
    setSelectedCompliance,
    selectedRegistration,
    setSelectedRegistration,
    verifiedOnly,
    setVerifiedOnly,
    hasActiveFilters,
    clearFilters,
  }
}

export type NgoNetworkState = ReturnType<typeof useNgoNetwork>
