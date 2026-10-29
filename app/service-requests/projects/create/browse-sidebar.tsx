'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

import { BrowseCatalogPanel, type CatalogFilter } from '@/components/browse-catalog-panel'
import { Button } from '@/components/ui/button'
import {
  BUDGET_FILTER_OPTIONS,
  OFFER_TYPE_FILTER_OPTIONS,
  TRANSACTION_FILTER_OPTIONS,
  matchesBudgetBucket,
  splitLocation,
  toFilterOptions,
} from '@/lib/catalog-filters'
import { CSR_SCHEDULE_VII_CATEGORIES } from '@/lib/categories'
import { formatStatusLabel } from '@/lib/format-date'
import { clientAuthFetchInit } from '@/lib/client-session'

type ListedProject = {
  id: string
  title: string
  description: string
  location: string
  category: string
  city: string
  state: string
  budget_inr: number | null
  ngo_name: string
}

type ListedOffer = {
  id: number
  title: string
  offer_type: string
  transaction_type: string
  city: string
  state: string
  amount: number | null
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function readString(value: unknown) {
  return value == null ? '' : String(value)
}

function mapProject(row: unknown): ListedProject | null {
  const data = asRecord(row)
  const id = readString(data.id).trim()
  if (!id) return null
  const location = readString(data.location_summary || data.location || data.ngo_location)
  const parts = splitLocation(location)
  const budget = Number(data.budget_inr)
  return {
    id,
    title: readString(data.title).trim() || 'Untitled project',
    description: readString(data.description),
    location,
    category: readString(data.category),
    city: parts.city,
    state: parts.state,
    budget_inr: Number.isFinite(budget) && budget > 0 ? budget : null,
    ngo_name: readString(data.ngo_name),
  }
}

function mapOffer(row: unknown): ListedOffer | null {
  const data = asRecord(row)
  const id = Number(data.id)
  if (!Number.isFinite(id) || id <= 0) return null
  const amount = Number(data.price_amount ?? data.amount ?? 0)
  return {
    id,
    title: readString(data.title).trim() || 'Capability offer',
    offer_type: readString(data.offer_type),
    transaction_type: readString(data.transaction_type),
    city: readString(data.city),
    state: readString(data.state_province),
    amount: Number.isFinite(amount) && amount > 0 ? amount : null,
  }
}

export function ProjectCreateBrowseSidebar() {
  const [projects, setProjects] = useState<ListedProject[]>([])
  const [offers, setOffers] = useState<ListedOffer[]>([])
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [loadingOffers, setLoadingOffers] = useState(true)

  const [projectCategory, setProjectCategory] = useState('all')
  const [projectCity, setProjectCity] = useState('all')
  const [projectState, setProjectState] = useState('all')
  const [projectBudget, setProjectBudget] = useState('all')
  const [offerType, setOfferType] = useState('all')
  const [offerCity, setOfferCity] = useState('all')
  const [offerState, setOfferState] = useState('all')
  const [offerTransaction, setOfferTransaction] = useState('all')
  const [offerBudget, setOfferBudget] = useState('all')

  useEffect(() => {
    let cancelled = false
    void fetch('/api/service-request-projects?includeEmpty=true', clientAuthFetchInit())
      .then(async (response) => {
        const payload = await response.json().catch(() => null)
        return Array.isArray(payload?.data) ? payload.data : []
      })
      .then((rows) => {
        if (!cancelled) setProjects(rows.map(mapProject).filter((row): row is ListedProject => Boolean(row)))
      })
      .catch(() => {
        if (!cancelled) setProjects([])
      })
      .finally(() => {
        if (!cancelled) setLoadingProjects(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void fetch('/api/service-offers?view=all', clientAuthFetchInit())
      .then(async (response) => {
        const payload = await response.json().catch(() => null)
        return Array.isArray(payload?.data) ? payload.data : []
      })
      .then((rows) => {
        if (!cancelled) setOffers(rows.map(mapOffer).filter((row): row is ListedOffer => Boolean(row)))
      })
      .catch(() => {
        if (!cancelled) setOffers([])
      })
      .finally(() => {
        if (!cancelled) setLoadingOffers(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const filteredProjects = useMemo(
    () =>
      projects.filter((project) => {
        if (projectCategory !== 'all' && project.category !== projectCategory) return false
        if (projectCity !== 'all' && project.city !== projectCity) return false
        if (projectState !== 'all' && project.state !== projectState) return false
        if (!matchesBudgetBucket(project.budget_inr, projectBudget)) return false
        return true
      }),
    [projectBudget, projectCategory, projectCity, projectState, projects],
  )

  const filteredOffers = useMemo(
    () =>
      offers.filter((offer) => {
        if (offerType !== 'all' && offer.offer_type !== offerType) return false
        if (offerCity !== 'all' && offer.city !== offerCity) return false
        if (offerState !== 'all' && offer.state !== offerState) return false
        if (offerTransaction !== 'all' && offer.transaction_type !== offerTransaction) return false
        if (!matchesBudgetBucket(offer.amount, offerBudget)) return false
        return true
      }),
    [offerBudget, offerCity, offerState, offerTransaction, offerType, offers],
  )

  const projectFilters: CatalogFilter[] = [
    { id: 'project-category', label: 'Filter NGO projects by category', value: projectCategory, options: toFilterOptions([...CSR_SCHEDULE_VII_CATEGORIES, ...projects.map((project) => project.category)], 'All categories'), onChange: setProjectCategory },
    { id: 'project-city', label: 'Filter NGO projects by city', value: projectCity, options: toFilterOptions(projects.map((project) => project.city), 'All cities'), onChange: setProjectCity },
    { id: 'project-state', label: 'Filter NGO projects by state', value: projectState, options: toFilterOptions(projects.map((project) => project.state), 'All states'), onChange: setProjectState },
    { id: 'project-budget', label: 'Filter NGO projects by budget', value: projectBudget, options: BUDGET_FILTER_OPTIONS, onChange: setProjectBudget },
  ]

  const offerFilters: CatalogFilter[] = [
    { id: 'offer-type', label: 'Filter capability offers by type', value: offerType, options: OFFER_TYPE_FILTER_OPTIONS, onChange: setOfferType },
    { id: 'offer-city', label: 'Filter capability offers by city', value: offerCity, options: toFilterOptions(offers.map((offer) => offer.city), 'All cities'), onChange: setOfferCity },
    { id: 'offer-state', label: 'Filter capability offers by state', value: offerState, options: toFilterOptions(offers.map((offer) => offer.state), 'All states'), onChange: setOfferState },
    { id: 'offer-transaction', label: 'Filter capability offers by transaction', value: offerTransaction, options: TRANSACTION_FILTER_OPTIONS, onChange: setOfferTransaction },
    { id: 'offer-budget', label: 'Filter capability offers by budget', value: offerBudget, options: BUDGET_FILTER_OPTIONS, onChange: setOfferBudget },
  ]

  return (
    <aside className="space-y-4 lg:sticky lg:top-24">
      <BrowseCatalogPanel
        title="NGO Projects"
        description="Browse listed NGO projects. This does not change the project you are posting."
        loading={loadingProjects}
        items={filteredProjects}
        getItemKey={(project) => project.id}
        getSearchText={(project) =>
          `${project.title} ${project.description} ${project.location} ${project.ngo_name} ${project.category}`
        }
        searchPlaceholder="Search projects"
        filters={projectFilters}
        empty="No NGO projects are listed on the platform yet."
        renderItem={(project) => (
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="line-clamp-1 text-sm font-semibold text-slate-950">{project.title}</p>
            {project.ngo_name ? <p className="mt-1 line-clamp-1 text-xs text-slate-500">{project.ngo_name}</p> : null}
            <p className="mt-1 line-clamp-2 text-xs text-slate-600">{project.description || 'No description available.'}</p>
            <p className="mt-1 line-clamp-1 text-xs text-slate-500">
              {project.location || 'Location unavailable'}
              {project.budget_inr ? ` • INR ${project.budget_inr.toLocaleString('en-IN')}` : ''}
            </p>
            <Button type="button" size="sm" variant="outline" className="mt-3 w-full" asChild>
              <Link href={`/service-requests/projects/${project.id}`}>View project</Link>
            </Button>
          </div>
        )}
      />

      <BrowseCatalogPanel
        title="Capability Offers"
        description="Browse listed capability offers. This does not change the project you are posting."
        loading={loadingOffers}
        items={filteredOffers}
        getItemKey={(offer) => String(offer.id)}
        getSearchText={(offer) =>
          `${offer.title} ${offer.offer_type} ${offer.city} ${offer.state} ${offer.transaction_type}`
        }
        searchPlaceholder="Search offers"
        filters={offerFilters}
        empty="No capability offers are listed on the platform yet."
        renderItem={(offer) => (
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="line-clamp-1 text-sm font-semibold text-slate-950">{offer.title}</p>
            <p className="mt-1 line-clamp-1 text-xs text-slate-500">
              {offer.offer_type ? formatStatusLabel(offer.offer_type) : 'Offer'}
              {offer.transaction_type ? ` • ${formatStatusLabel(offer.transaction_type)}` : ''}
              {offer.city || offer.state ? ` • ${[offer.city, offer.state].filter(Boolean).join(', ')}` : ''}
              {offer.amount ? ` • INR ${offer.amount.toLocaleString('en-IN')}` : ''}
            </p>
            <Button type="button" size="sm" variant="outline" className="mt-3 w-full" asChild>
              <Link href={`/service-offers/${offer.id}`}>View offer</Link>
            </Button>
          </div>
        )}
      />
    </aside>
  )
}
