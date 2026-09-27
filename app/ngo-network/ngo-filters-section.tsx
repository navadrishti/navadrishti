"use client"

import { MapPin, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { StyledSelect } from "@/components/ui/styled-select"
import { COMPLIANCE_OPTIONS, REGISTRATION_OPTIONS, SECTOR_OPTIONS } from "./filter-options"
import type { NgoNetworkState } from "./use-ngo-network"

const compactControlClass = "h-9 text-sm"

export function NgoFiltersSection({ network }: { network: NgoNetworkState }) {
  const {
    ngos,
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
  } = network

  return (
    <section className="mb-4 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-3 flex h-8 items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          Filters
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={`h-8 px-2 text-xs ${hasActiveFilters ? "" : "invisible pointer-events-none"}`}
          onClick={clearFilters}
          tabIndex={hasActiveFilters ? 0 : -1}
          aria-hidden={!hasActiveFilters}
          disabled={!hasActiveFilters}
        >
          Clear filters
        </Button>
      </div>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search NGO name or mission..."
            className={`${compactControlClass} pl-8`}
          />
        </div>

        <div className="relative">
          <MapPin className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="State or city (e.g. New Delhi)"
            className={`${compactControlClass} pl-8`}
          />
        </div>

        <StyledSelect
          value={selectedSector}
          options={SECTOR_OPTIONS}
          placeholder="All sectors"
          onValueChange={setSelectedSector}
          className={compactControlClass}
        />

        <StyledSelect
          value={selectedCompliance}
          options={COMPLIANCE_OPTIONS}
          placeholder="Any compliance"
          onValueChange={setSelectedCompliance}
          className={compactControlClass}
        />

        <StyledSelect
          value={selectedRegistration}
          options={REGISTRATION_OPTIONS}
          placeholder="Any registration type"
          onValueChange={setSelectedRegistration}
          className={compactControlClass}
        />
      </div>

      <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Checkbox
            id="verified-only"
            checked={verifiedOnly}
            onCheckedChange={(checked) => setVerifiedOnly(checked === true)}
          />
          <Label htmlFor="verified-only" className="text-xs font-medium text-slate-700">
            Show only verified NGOs
          </Label>
        </div>

        <p className="text-xs text-slate-600">
          <span className="font-semibold text-slate-900">{ngos.length}</span> NGO
          {ngos.length === 1 ? "" : "s"} match your filters
        </p>
      </div>
    </section>
  )
}
