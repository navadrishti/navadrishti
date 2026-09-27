import { Search, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { StyledSelect } from "@/components/ui/styled-select"
import { CSR_SCHEDULE_VII_CATEGORIES } from "@/lib/categories"
import { BUDGET_OPTIONS, VOLUNTEER_SLOT_OPTIONS } from "./helpers"
import type { CampaignFilterState } from "./use-campaign-filters"

const compactControlClass = "h-9 text-sm"

const CATEGORY_OPTIONS = ['all', ...CSR_SCHEDULE_VII_CATEGORIES].map((category) => ({
  value: category,
  label: category === 'all' ? 'All Categories' : category
}))

type CampaignFiltersProps = {
  filters: CampaignFilterState
  loading: boolean
  resultCount: number
}

export function CampaignFilters({ filters, loading, resultCount }: CampaignFiltersProps) {
  return (
    <section className="mb-6 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        Filters
      </div>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search campaigns or company..."
            className={`${compactControlClass} pl-8`}
            value={filters.searchQuery}
            onChange={(e) => filters.setSearchQuery(e.target.value)}
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
          placeholder="All Categories"
          onValueChange={filters.setSelectedCategory}
          className={compactControlClass}
        />

        <StyledSelect
          value={filters.selectedBudget}
          options={BUDGET_OPTIONS}
          placeholder="Any budget"
          onValueChange={filters.setSelectedBudget}
          className={compactControlClass}
        />

        <StyledSelect
          value={filters.selectedVolunteerSlots}
          options={VOLUNTEER_SLOT_OPTIONS}
          placeholder="Any volunteer slots"
          onValueChange={filters.setSelectedVolunteerSlots}
          className={compactControlClass}
        />
      </div>

      <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">
          {loading
            ? 'Loading campaigns...'
            : `${resultCount} campaign${resultCount === 1 ? '' : 's'} match your filters`}
        </p>
        {filters.hasActiveFilters ? (
          <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-slate-600" onClick={filters.clearFilters}>
            Clear filters
          </Button>
        ) : null}
      </div>
    </section>
  )
}
