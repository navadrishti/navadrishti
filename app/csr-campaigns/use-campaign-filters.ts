import { useState } from "react"
import { isCampaignStarted } from "@/lib/format-date"
import { matchesBudgetBand } from "./helpers"
import type { Campaign } from "./types"

export type CampaignFilterState = ReturnType<typeof useCampaignFilters>

export function useCampaignFilters() {
  const [searchQuery, setSearchQuery] = useState("")
  const [locationFilter, setLocationFilter] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [selectedBudget, setSelectedBudget] = useState("all")
  const [selectedVolunteerSlots, setSelectedVolunteerSlots] = useState("all")

  const hasActiveFilters =
    Boolean(searchQuery.trim())
    || Boolean(locationFilter.trim())
    || selectedCategory !== 'all'
    || selectedBudget !== 'all'
    || selectedVolunteerSlots !== 'all'

  const clearFilters = () => {
    setSearchQuery('')
    setLocationFilter('')
    setSelectedCategory('all')
    setSelectedBudget('all')
    setSelectedVolunteerSlots('all')
  }

  const matchesFilters = (campaign: Campaign) => {
    const query = searchQuery.trim().toLowerCase()
    const locationTerm = locationFilter.trim().toLowerCase()
    const matchesSearch = !query
      || campaign.title.toLowerCase().includes(query)
      || campaign.company.toLowerCase().includes(query)
      || campaign.description.toLowerCase().includes(query)
    const matchesLocation = !locationTerm || campaign.location.toLowerCase().includes(locationTerm)
    const matchesCategory = selectedCategory === 'all' || campaign.category === selectedCategory
    const matchesBudget = matchesBudgetBand(campaign.budgetInr, selectedBudget)
    const limit = Number(campaign.volunteerLimit || 0)
    const count = Number(campaign.volunteerCount || 0)
    const hasOpenSlots = limit > 0 && count < limit
    const matchesVolunteerSlots =
      selectedVolunteerSlots === 'all'
      || (selectedVolunteerSlots === 'open' && hasOpenSlots)
      || (selectedVolunteerSlots === 'full' && !hasOpenSlots)
    const isUpcoming = !isCampaignStarted(campaign.start_date)
    return matchesSearch && matchesLocation && matchesCategory && matchesBudget && matchesVolunteerSlots && isUpcoming
  }

  return {
    searchQuery,
    setSearchQuery,
    locationFilter,
    setLocationFilter,
    selectedCategory,
    setSelectedCategory,
    selectedBudget,
    setSelectedBudget,
    selectedVolunteerSlots,
    setSelectedVolunteerSlots,
    hasActiveFilters,
    clearFilters,
    matchesFilters,
  }
}
