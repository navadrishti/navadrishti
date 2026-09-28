"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"

export interface ProfileSearchResult {
  id: number;
  name: string;
  user_type: 'individual' | 'ngo' | 'company';
  profile_image?: string;
  verification_status?: string;
  location?: string;
}

export function useProfileSearch() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ProfileSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [showAllResults, setShowAllResults] = useState(false)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const searchProfiles = async (query: string) => {
    if (!query.trim()) { setSearchResults([]); return }

    setIsSearching(true)
    try {
      const res = await fetch(`/api/search/profiles?q=${encodeURIComponent(query.trim())}&limit=8`)
      const data = await res.json()
      setSearchResults(res.ok ? data.profiles || [] : [])
    } catch {
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    setShowResults(true)

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => searchProfiles(value), 150)
  }

  const handleProfileSelect = (profile: ProfileSearchResult) => {
    setSearchQuery('')
    setSearchResults([])
    setShowResults(false)
    setShowAllResults(false)
    router.push(`/profile/${profile.id}`)
  }

  const clearSearch = () => {
    setSearchQuery('')
    setSearchResults([])
    setShowResults(false)
    setShowAllResults(false)
  }

  return {
    searchQuery,
    searchResults,
    isSearching,
    showResults,
    setShowResults,
    showAllResults,
    setShowAllResults,
    handleSearchChange,
    handleProfileSelect,
    clearSearch,
  }
}

export type ProfileSearch = ReturnType<typeof useProfileSearch>
