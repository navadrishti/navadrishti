"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { StyledSelect } from "@/components/ui/styled-select"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { useAuth } from "@/lib/auth-context"
import { ProfileCoverMedia } from "@/components/profile-card"
import { NgoPayDialog } from "@/components/profile-dashboard-tab"
import { NgoComplianceBadges, VerificationBadge } from "@/components/verification-badge"
import { CSR_SCHEDULE_VII_CATEGORIES } from "@/lib/categories"
import {
  ArrowRight,
  Mail,
  MapPin,
  RefreshCw,
  Search,
} from "lucide-react"
import { isCaVerifiedAccount } from "@/lib/auth"

interface NgoCompliance {
  verified: boolean
  csr1: boolean
  section_12a: boolean
  section_80g: boolean
  fcra: boolean
  section_8: boolean
}

interface NGO {
  id: number
  name: string
  email: string
  phone: string | null
  profile_image: string | null
  cover_image?: string | null
  location: string | null
  sector: string | null
  sectors_schedule_vii?: string[]
  registration_type: string | null
  execution_capacity: string | null
  size: string | null
  mission: string | null
  past_projects_count: number
  projects_completed_count: number
  projects_ongoing_count: number
  projects_active_count: number
  geographic_coverage_preview: string | null
  compliance: NgoCompliance
  ca_badge_number?: string | null
  ca_compliance_tags?: string[]
  accepts_payments?: boolean
  csr_eligible?: boolean
}

const SECTOR_OPTIONS = [
  { value: "all", label: "All sectors" },
  ...CSR_SCHEDULE_VII_CATEGORIES.map((sector) => ({ value: sector, label: sector })),
]

const COMPLIANCE_OPTIONS = [
  { value: "all", label: "Any compliance" },
  { value: "12a", label: "12A" },
  { value: "80g", label: "80G" },
  { value: "csr1", label: "CSR-1" },
  { value: "fcra", label: "FCRA" },
]

const REGISTRATION_OPTIONS = [
  { value: "all", label: "Any registration type" },
  { value: "Trust", label: "Trust" },
  { value: "Society", label: "Society" },
  { value: "Section 8", label: "Section 8" },
]

const compactControlClass = "h-9 text-sm"

function getInitials(name: string) {
  if (!name) return "N"
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function NGONetworkRowSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="relative lg:hidden">
        <Skeleton className="h-20 w-full rounded-none" />
        <Skeleton className="absolute -bottom-8 left-3 h-16 w-16 rounded-md border-2 border-white" />
      </div>
      <div className="p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <Skeleton className="hidden h-20 w-20 shrink-0 rounded-md lg:block" />
          <div className="min-w-0 flex-1 space-y-1.5 pt-9 lg:pt-0">
            <Skeleton className="h-4 w-48 max-w-full rounded" />
            <Skeleton className="h-3 w-32 max-w-full rounded" />
            <Skeleton className="h-3 w-24 rounded" />
          </div>
          <div className="w-full space-y-1.5 lg:w-44">
            <Skeleton className="h-5 w-full rounded-full" />
            <Skeleton className="h-8 w-full rounded-md" />
            <Skeleton className="h-8 w-full rounded-md" />
          </div>
        </div>
      </div>
    </div>
  )
}

function ngoComplianceTags(ngo: NGO) {
  if (Array.isArray(ngo.ca_compliance_tags) && ngo.ca_compliance_tags.length > 0) {
    return ngo.ca_compliance_tags
  }
  return [
    ngo.compliance.section_12a ? 'twelve_a' : null,
    ngo.compliance.section_80g ? 'eighty_g' : null,
    ngo.compliance.csr1 ? 'csr1' : null,
    ngo.compliance.fcra ? 'fcra' : null,
  ].filter((tag): tag is string => Boolean(tag))
}

function NgoNetworkCard({
  ngo,
  canPay,
  payerCaVerified,
  isNgoViewer,
  userId,
  userType,
  onPay,
}: {
  ngo: NGO
  canPay: boolean
  payerCaVerified: boolean
  isNgoViewer: boolean
  userId?: number
  userType?: string
  onPay: (ngo: NGO) => void
}) {
  const canPayNgo =
    canPay &&
    payerCaVerified &&
    (ngo.accepts_payments ?? ngo.compliance.verified) &&
    (userType !== "company" || Boolean(ngo.csr_eligible || ngo.compliance.csr1))
  const sectorLabels = ngo.sectors_schedule_vii?.length
    ? ngo.sectors_schedule_vii
    : ngo.sector
      ? [ngo.sector]
      : []

  return (
    <article className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="relative lg:hidden">
        <ProfileCoverMedia src={ngo.cover_image} className="h-20 w-full" alt="" />
        <div className="absolute -bottom-8 left-3 h-16 w-16 overflow-hidden rounded-md border-2 border-white bg-slate-50 shadow-sm">
          {ngo.profile_image ? (
            <Image
              src={ngo.profile_image}
              alt={ngo.name}
              width={64}
              height={64}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-udaan-orange text-sm font-bold text-white">
              {getInitials(ngo.name)}
            </div>
          )}
        </div>
      </div>

      <div className="p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="mx-auto hidden h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50 lg:mx-0 lg:flex">
            {ngo.profile_image ? (
              <Image
                src={ngo.profile_image}
                alt={ngo.name}
                width={80}
                height={80}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-udaan-orange text-base font-bold text-white">
                {getInitials(ngo.name)}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 pt-9 lg:pt-0">
            <h2 className="flex min-w-0 flex-wrap items-center gap-1.5 text-base font-bold text-slate-900">
              <span className="min-w-0 break-words">{ngo.name}</span>
              {ngo.compliance.verified ? (
                <VerificationBadge
                  status="verified"
                  size="sm"
                  showText={false}
                  badgeNumber={ngo.ca_badge_number}
                  className="max-w-full min-w-0"
                />
              ) : null}
            </h2>

            <p className="mt-1 flex items-start gap-1.5 text-xs text-slate-600">
              <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
              <span>{ngo.location || "Location not listed"}</span>
            </p>

            {sectorLabels.length > 0 ? (
              <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                Sector: {sectorLabels.join("; ")}
              </p>
            ) : null}

            {!isNgoViewer && ngo.email ? (
              <p className="mt-1 flex items-start gap-1.5 text-xs text-slate-600">
                <Mail className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
                <a href={`mailto:${ngo.email}`} className="break-all hover:text-emerald-700 hover:underline">
                  {ngo.email}
                </a>
              </p>
            ) : null}

            {ngo.geographic_coverage_preview ? (
              <p className="mt-0.5 text-[11px] text-slate-500">
                Coverage: {ngo.geographic_coverage_preview}
              </p>
            ) : null}

            {ngo.mission ? (
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-700">{ngo.mission}</p>
            ) : null}

            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
              <span>
                <span className="font-medium text-slate-800">{ngo.projects_completed_count || 0}</span>
                {' '}
                {(ngo.projects_completed_count || 0) === 1 ? 'project completed' : 'projects completed'}
              </span>
              <span>
                <span className="font-medium text-slate-800">{ngo.projects_ongoing_count || 0}</span>
                {' '}
                {(ngo.projects_ongoing_count || 0) === 1 ? 'ongoing project' : 'ongoing projects'}
              </span>
              <span>
                <span className="font-medium text-slate-800">{ngo.projects_active_count || 0}</span>
                {' '}
                {(ngo.projects_active_count || 0) === 1 ? 'active project' : 'active projects'}
              </span>
              {ngo.execution_capacity ? (
                <span>Capacity: {ngo.execution_capacity}</span>
              ) : null}
            </div>
          </div>

          <div className="flex w-full shrink-0 flex-col gap-1.5 lg:w-44">
            <div className="flex min-h-6 min-w-0 max-w-full flex-wrap items-center gap-x-2 gap-y-1">
              <NgoComplianceBadges
                tags={ngoComplianceTags(ngo)}
                registrationType={ngo.registration_type}
                size="sm"
                className="max-w-full"
              />
            </div>

            <Button
              asChild
              size="sm"
              className="h-8 w-full bg-emerald-700 text-white hover:bg-emerald-800"
            >
              <Link href={`/profile/${ngo.id}`}>
                View profile
                <ArrowRight className="ml-1.5 h-3 w-3" />
              </Link>
            </Button>

            {canPayNgo ? (
              <Button
                size="sm"
                variant="outline"
                className="h-8 w-full"
                onClick={() => onPay(ngo)}
              >
                Pay
              </Button>
            ) : canPay && !payerCaVerified ? (
              <Button size="sm" variant="outline" className="h-8 w-full" disabled>
                Verification required
              </Button>
            ) : canPay ? (
              <Button size="sm" variant="outline" className="h-8 w-full" disabled>
                Payout setup pending
              </Button>
            ) : isNgoViewer ? (
              ngo.id !== userId && ngo.email ? (
                <Button asChild size="sm" variant="outline" className="h-8 w-full">
                  <a href={`mailto:${ngo.email}`}>
                    Contact
                  </a>
                </Button>
              ) : null
            ) : (
              <Button asChild size="sm" variant="outline" className="h-8 w-full">
                <Link href="/login">
                  Sign in to pay
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

export default function NGONetworkPage() {
  const { user } = useAuth()
  const [ngos, setNgos] = useState<NGO[]>([])
  const [recommended, setRecommended] = useState<NGO[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingRecommended, setLoadingRecommended] = useState(false)
  const [refreshingRecommended, setRefreshingRecommended] = useState(false)
  const [search, setSearch] = useState("")
  const [location, setLocation] = useState("")
  const [selectedSector, setSelectedSector] = useState("all")
  const [selectedCompliance, setSelectedCompliance] = useState("all")
  const [selectedRegistration, setSelectedRegistration] = useState("all")
  const [verifiedOnly, setVerifiedOnly] = useState(true)
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [debouncedLocation, setDebouncedLocation] = useState("")
  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const [payingNgo, setPayingNgo] = useState<NGO | null>(null)

  const canPay = user?.user_type === "individual" || user?.user_type === "company"
  const isNgoViewer = user?.user_type === "ngo"
  const payerCaVerified = isCaVerifiedAccount(user?.verification_status)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim())
      setDebouncedLocation(location.trim())
    }, 300)
    return () => clearTimeout(timer)
  }, [search, location])

  useEffect(() => {
    const params = new URLSearchParams()
    if (debouncedSearch) params.set("search", debouncedSearch)
    if (debouncedLocation) params.set("location", debouncedLocation)
    if (selectedSector !== "all") params.set("sector", selectedSector)
    if (selectedCompliance !== "all") params.set("compliance", selectedCompliance)
    if (selectedRegistration !== "all") params.set("registration_type", selectedRegistration)
    params.set("verified_only", verifiedOnly ? "true" : "false")

    setLoading(true)
    fetch(`/api/ngos/network?${params.toString()}`)
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          setNgos(Array.isArray(data.ngos) ? data.ngos : [])
        } else {
          setNgos([])
        }
      })
      .catch(() => {
        setNgos([])
      })
      .finally(() => setLoading(false))
  }, [debouncedSearch, debouncedLocation, selectedSector, selectedCompliance, selectedRegistration, verifiedOnly])

  const fetchRecommended = useCallback(async (opts?: { refresh?: boolean }) => {
    if (!user?.id) {
      setRecommended([])
      return
    }

    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null
    if (!token) {
      setRecommended([])
      return
    }

    const isRefresh = Boolean(opts?.refresh)
    if (isRefresh) setRefreshingRecommended(true)
    else setLoadingRecommended(true)

    try {
      const params = new URLSearchParams({
        recommend: "1",
        verified_only: "true",
        shuffle: "1",
      })
      const response = await fetch(`/api/ngos/network?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json()
      if (response.ok && data?.success) {
        setRecommended(Array.isArray(data.recommended) ? data.recommended : [])
      } else {
        setRecommended([])
      }
    } catch {
      setRecommended([])
    } finally {
      if (isRefresh) setRefreshingRecommended(false)
      else setLoadingRecommended(false)
    }
  }, [user?.id])

  useEffect(() => {
    fetchRecommended()
  }, [fetchRecommended])

  const hasActiveFilters = Boolean(
    debouncedSearch ||
    debouncedLocation ||
    selectedSector !== "all" ||
    selectedCompliance !== "all" ||
    selectedRegistration !== "all" ||
    !verifiedOnly
  )

  const clearFilters = () => {
    setSearch("")
    setLocation("")
    setDebouncedSearch("")
    setDebouncedLocation("")
    setSelectedSector("all")
    setSelectedCompliance("all")
    setSelectedRegistration("all")
    setVerifiedOnly(true)
  }

  const openPayDialog = (ngo: NGO) => {
    setPayingNgo(ngo)
    setPayDialogOpen(true)
  }

  const showRecommendedSection = Boolean(user?.id)

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Header />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">NGO Network</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Discover verified NGOs, review their profiles and contact details, then pay them directly via GRAM.
          </p>
        </div>

        {showRecommendedSection ? (
          <section className="mb-4 rounded-lg border border-slate-200 bg-white shadow-sm">
            <Accordion type="single" collapsible defaultValue="recommended">
              <AccordionItem value="recommended" className="border-0">
                <div className="flex items-center gap-2 px-3">
                  <AccordionTrigger className="flex-1 py-3 text-left hover:no-underline [&[data-state=open]>svg]:rotate-180">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Recommended for you
                    </span>
                  </AccordionTrigger>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 gap-1.5 px-2 text-xs text-slate-600 hover:bg-transparent hover:text-slate-600"
                    disabled={loadingRecommended || refreshingRecommended}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      fetchRecommended({ refresh: true })
                    }}
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${refreshingRecommended ? "animate-spin" : ""}`}
                    />
                    Refresh
                  </Button>
                </div>
                <AccordionContent className="space-y-0 px-3 pb-3">
                  <div className="space-y-3 border-t border-slate-100 pt-3">
                    {loadingRecommended ? (
                      Array.from({ length: 2 }).map((_, index) => (
                        <NGONetworkRowSkeleton key={`rec-skel-${index}`} />
                      ))
                    ) : recommended.length === 0 ? (
                      <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                        No strong matches yet. Add location and focus details to your profile to improve recommendations.
                      </div>
                    ) : (
                      recommended.map((ngo) => (
                        <NgoNetworkCard
                          key={`recommended-${ngo.id}`}
                          ngo={ngo}
                          canPay={canPay}
                          payerCaVerified={payerCaVerified}
                          isNgoViewer={isNgoViewer}
                          userId={user?.id}
                          userType={user?.user_type}
                          onPay={openPayDialog}
                        />
                      ))
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </section>
        ) : null}

        <section className="mb-4 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Filters
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

            <div className="flex items-center gap-2">
              {hasActiveFilters ? (
                <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : null}
              <p className="text-xs text-slate-600">
                <span className="font-semibold text-slate-900">{ngos.length}</span> NGO
                {ngos.length === 1 ? "" : "s"} match your filters
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-2">
          {loading ? (
            Array.from({ length: 4 }).map((_, index) => <NGONetworkRowSkeleton key={index} />)
          ) : ngos.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white py-14 text-center text-slate-500">
              <p className="text-lg font-semibold text-slate-700">No NGOs found</p>
              <p className="mt-1 text-sm">Try a different search term or clear filters to see more NGOs.</p>
              {hasActiveFilters ? (
                <Button type="button" variant="outline" size="sm" className="mt-4" onClick={clearFilters}>
                  Reset filters
                </Button>
              ) : null}
            </div>
          ) : (
            ngos.map((ngo) => (
              <NgoNetworkCard
                key={ngo.id}
                ngo={ngo}
                canPay={canPay}
                payerCaVerified={payerCaVerified}
                isNgoViewer={isNgoViewer}
                userId={user?.id}
                userType={user?.user_type}
                onPay={openPayDialog}
              />
            ))
          )}
        </section>

        <NgoPayDialog
          ngo={payingNgo}
          open={payDialogOpen}
          onOpenChange={(open) => {
            setPayDialogOpen(open)
            if (!open) setPayingNgo(null)
          }}
        />
      </main>
    </div>
  )
}
