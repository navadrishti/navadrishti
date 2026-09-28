'use client'

import { useState, useEffect, useEffectEvent, useMemo } from 'react'
import { useIsClient } from '@/hooks/use-is-client'
import { useNow } from '@/hooks/use-now'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/hooks/use-toast'
import type { ListingKind, ProjectListing, ServiceRequestListing } from './types'

export function useServiceRequests() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const mounted = useIsClient()
  const [listingKind, setListingKind] = useState<ListingKind>('needs')
  const [searchTerm, setSearchTerm] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedNeedType, setSelectedNeedType] = useState('all')
  const [selectedUrgency, setSelectedUrgency] = useState('all')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [debouncedLocation, setDebouncedLocation] = useState('')
  const [requests, setRequests] = useState<ServiceRequestListing[]>([])
  const [projects, setProjects] = useState<ProjectListing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState<number | null>(null)
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null)
  const currentTime = useNow()

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim())
      setDebouncedLocation(locationFilter.trim())
    }, 300)
    return () => clearTimeout(timer)
  }, [searchTerm, locationFilter])

  const authReady = mounted && !authLoading
  const isNGO = authReady && user?.user_type === 'ngo'

  const tabParam = String(searchParams.get('tab') || searchParams.get('view') || '').toLowerCase()
  const [syncedTabParam, setSyncedTabParam] = useState<string | null>(null)
  if (syncedTabParam !== tabParam) {
    setSyncedTabParam(tabParam)
    if (tabParam === 'projects' || tabParam === 'project') {
      setListingKind('projects')
    } else if (tabParam === 'needs' || tabParam === 'need' || tabParam === 'my-requests') {
      setListingKind('needs')
    }
  }

  const hasActiveFilters = useMemo(() => {
    const shared =
      Boolean(debouncedSearch) ||
      Boolean(debouncedLocation) ||
      selectedCategory !== 'all'
    if (listingKind === 'projects') return shared
    return shared || selectedNeedType !== 'all' || selectedUrgency !== 'all'
  }, [debouncedSearch, debouncedLocation, selectedCategory, selectedNeedType, selectedUrgency, listingKind])

  const deleteRequest = async (id: number) => {
    if (!user || !confirm('Delete this need? This cannot be undone.')) return

    setDeleting(id)
    try {
      const res = await fetch(`/api/service-requests/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
      })
      const data = await res.json()

      if (data.success) {
        toast({ title: 'Success', description: 'Need deleted' })
        fetchNeeds()
      } else {
        toast({ title: 'Error', description: data.error || 'Delete failed', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', description: 'Delete failed', variant: 'destructive' })
    } finally {
      setDeleting(null)
    }
  }

  const deleteProject = async (id: string) => {
    if (!user || !confirm('Delete this project? This cannot be undone.')) return

    setDeletingProjectId(String(id))
    try {
      const res = await fetch(`/api/service-request-projects/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
      })
      const data = await res.json().catch(() => null)

      if (res.ok && data?.success) {
        toast({ title: 'Success', description: 'Project deleted' })
        fetchProjects()
      } else {
        toast({ title: 'Error', description: data?.error || 'Delete failed', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', description: 'Delete failed', variant: 'destructive' })
    } finally {
      setDeletingProjectId(null)
    }
  }

  const fetchNeeds = async () => {
    setLoading(true)
    setError('')

    const params = new URLSearchParams({
      view: 'all',
      ...(selectedCategory !== 'all' && { category: selectedCategory }),
      ...(selectedNeedType !== 'all' && { request_type: selectedNeedType }),
      ...(selectedUrgency !== 'all' && { urgency: selectedUrgency }),
      ...(debouncedSearch && { search: debouncedSearch }),
      ...(debouncedLocation && { location: debouncedLocation }),
      ...(user?.id && { userId: user.id.toString() }),
    })

    try {
      const res = await fetch(`/api/service-requests?${params}`)
      const data = await res.json()

      if (data.success) {
        setRequests(Array.isArray(data.data) ? data.data : [])
      } else {
        setError(data.error || 'Failed to load needs')
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  const fetchProjects = async () => {
    setLoading(true)
    setError('')

    const params = new URLSearchParams({
      includeEmpty: 'true',
      status: 'active',
      ...(debouncedSearch && { q: debouncedSearch }),
    })

    try {
      const res = await fetch(`/api/service-request-projects?${params}`)
      const data = await res.json()

      if (data.success) {
        setProjects(Array.isArray(data.data) ? data.data : [])
      } else {
        setError(data.error || 'Failed to load projects')
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  const loadListing = useEffectEvent(() => {
    if (listingKind === 'projects') {
      fetchProjects()
      return
    }
    fetchNeeds()
  })

  useEffect(() => {
    if (authReady) loadListing()
  }, [
    listingKind,
    selectedCategory,
    selectedNeedType,
    selectedUrgency,
    debouncedSearch,
    debouncedLocation,
    user?.id,
    authReady,
  ])

  const clearFilters = () => {
    setSearchTerm('')
    setLocationFilter('')
    setDebouncedSearch('')
    setDebouncedLocation('')
    setSelectedCategory('all')
    setSelectedNeedType('all')
    setSelectedUrgency('all')
  }

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const category = String(project.category || '').toLowerCase()
      const locationHay = `${project.formatted_address || ''} ${project.location_summary || ''} ${project.exact_address || ''} ${project.location || ''} ${project.ngo_location || ''}`.toLowerCase()
      if (selectedCategory !== 'all' && category !== selectedCategory.toLowerCase()) return false
      if (debouncedLocation && !locationHay.includes(debouncedLocation.toLowerCase())) return false
      return true
    })
  }, [projects, selectedCategory, debouncedLocation])

  const handleListingChange = (value: string) => {
    const next = value === 'projects' ? 'projects' : 'needs'
    setListingKind(next)
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', next)
    router.replace(`/service-requests?${params.toString()}`, { scroll: false })
  }

  return {
    user,
    isNGO,
    listingKind,
    handleListingChange,
    filters: {
      searchTerm,
      setSearchTerm,
      locationFilter,
      setLocationFilter,
      selectedCategory,
      setSelectedCategory,
      selectedNeedType,
      setSelectedNeedType,
      selectedUrgency,
      setSelectedUrgency,
    },
    hasActiveFilters,
    clearFilters,
    requests,
    filteredProjects,
    loading,
    error,
    retry: listingKind === 'projects' ? fetchProjects : fetchNeeds,
    currentTime,
    deleting,
    deletingProjectId,
    deleteRequest,
    deleteProject,
  }
}

export type ServiceRequestFilters = ReturnType<typeof useServiceRequests>['filters']
