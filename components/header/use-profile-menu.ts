"use client"

import { useState, useEffect, useRef } from "react"

export function useProfileMenu() {
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const profileMenuTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    return () => {
      if (profileMenuTimeoutRef.current) {
        clearTimeout(profileMenuTimeoutRef.current)
      }
    }
  }, [])

  const openProfileMenu = () => {
    if (profileMenuTimeoutRef.current) {
      clearTimeout(profileMenuTimeoutRef.current)
      profileMenuTimeoutRef.current = null
    }
    setIsProfileMenuOpen(true)
  }

  const closeProfileMenuWithDelay = (delayMs = 220) => {
    if (profileMenuTimeoutRef.current) {
      clearTimeout(profileMenuTimeoutRef.current)
    }
    profileMenuTimeoutRef.current = setTimeout(() => {
      setIsProfileMenuOpen(false)
    }, delayMs)
  }

  return { isProfileMenuOpen, openProfileMenu, closeProfileMenuWithDelay }
}
