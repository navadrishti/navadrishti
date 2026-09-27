'use client'

import { Search, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StyledSelect } from '@/components/ui/styled-select'
import { CSR_SCHEDULE_VII_CATEGORIES, SERVICE_REQUEST_TYPES } from '@/lib/categories'
import type { ListingKind } from './types'
import type { ServiceRequestFilters } from './use-service-requests'

const compactControlClass = 'h-9 text-sm'

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All categories' },
  ...CSR_SCHEDULE_VII_CATEGORIES.map((category) => ({ value: category, label: category })),
]

const NEED_TYPE_OPTIONS = [
  { value: 'all', label: 'All need types' },
  ...SERVICE_REQUEST_TYPES.map((type) => ({ value: type, label: type })),
]

const URGENCY_OPTIONS = [
  { value: 'all', label: 'Any urgency' },
  { value: 'low', label: 'Low', bulletClassName: 'bg-[#4F6B5C]' },
  { value: 'medium', label: 'Medium', bulletClassName: 'bg-udaan-blue' },
  { value: 'high', label: 'High', bulletClassName: 'bg-[#8A6F45]' },
  { value: 'critical', label: 'Critical', bulletClassName: 'bg-[#8C5555]' },
]

export function FiltersBar({
  listingKind,
  filters,
  loading,
  resultCount,
  hasActiveFilters,
  onClear,
}: {
  listingKind: ListingKind
  filters: ServiceRequestFilters
  loading: boolean
  resultCount: number
  hasActiveFilters: boolean
  onClear: () => void
}) {
  const resultLabel = listingKind === 'projects' ? 'project' : 'need'

  return (
    <section className="mb-6 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        Filters
      </div>

      <div
        className={`grid gap-2 md:grid-cols-2 ${
          listingKind === 'projects' ? 'xl:grid-cols-3' : 'xl:grid-cols-5'
        }`}
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            type="search"
            placeholder={listingKind === 'projects' ? 'Search projects...' : 'Search needs...'}
            className={`${compactControlClass} pl-8`}
            value={filters.searchTerm}
            onChange={(e) => filters.setSearchTerm(e.target.value)}
          />
        </div>

        <div className="relative">
          <MapPin className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            value={filters.locationFilter}
            onChange={(e) => filters.setLocationFilter(e.target.value)}
            placeholder="State or city"
            className={`${compactControlClass} pl-8`}
          />
        </div>

        <StyledSelect
          value={filters.selectedCategory}
          options={CATEGORY_OPTIONS}
          placeholder="All categories"
          onValueChange={filters.setSelectedCategory}
          className={compactControlClass}
        />

        {listingKind === 'needs' ? (
          <>
            <StyledSelect
              value={filters.selectedNeedType}
              options={NEED_TYPE_OPTIONS}
              placeholder="All need types"
              onValueChange={filters.setSelectedNeedType}
              className={compactControlClass}
            />

            <StyledSelect
              value={filters.selectedUrgency}
              options={URGENCY_OPTIONS}
              placeholder="Any urgency"
              onValueChange={filters.setSelectedUrgency}
              className={compactControlClass}
            />
          </>
        ) : null}
      </div>

      <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">
          {loading
            ? `Loading ${resultLabel}s...`
            : `${resultCount} ${resultLabel}${resultCount === 1 ? '' : 's'} match your filters`}
        </p>
        {hasActiveFilters ? (
          <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-slate-600" onClick={onClear}>
            Clear filters
          </Button>
        ) : null}
      </div>
    </section>
  )
}
