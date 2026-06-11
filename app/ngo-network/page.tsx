"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Header } from "@/components/header"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { MapPin, Search, Building2 } from "lucide-react"
import { VerificationBadge } from "@/components/verification-badge"

interface NGO {
  id: number
  name: string
  email: string
  phone: string | null
  profile_image: string | null
  location: string | null
  sector: string | null
  registration_type: string | null
  size: string | null
}

const ngoCardClassName =
  "w-full max-w-[360px] overflow-hidden rounded-md border-2 border-slate-200 bg-white shadow-none"

function getInitials(name: string) {
  if (!name) return "N"
  const parts = name.trim().split(" ")
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function formatNgoSize(ngo: NGO) {
  if (ngo.size) return ngo.size
  return "Not set"
}

function formatPhone(phone: string | null) {
  if (phone && phone.trim()) return phone.trim()
  return "Not Available"
}

function NGONetworkCardSkeleton() {
  return (
    <Card className={ngoCardClassName}>
      <CardContent className="p-2">
        <Skeleton className="h-5 w-28 rounded-full" />

        <div className="mt-1.5 flex min-w-0 items-center gap-2 border-t border-slate-200 pt-1.5">
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <Skeleton className="h-5 w-3/4 rounded" />
        </div>

        <div className="mt-1.5 min-w-0 border-t border-slate-200 pt-1.5">
          <Skeleton className="h-3 w-10 rounded" />
          <Skeleton className="mt-0.5 h-4 w-full rounded" />
        </div>

        <div className="mt-1.5 flex min-w-0 gap-2 border-t border-slate-200 pt-1.5">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3 w-full rounded" />
            <Skeleton className="h-3 w-full rounded" />
          </div>
          <Skeleton className="w-px shrink-0 self-stretch rounded-none" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3 w-full rounded" />
            <Skeleton className="h-3 w-full rounded" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function NGONetworkPage() {
  const [ngos, setNgos] = useState<NGO[]>([])
  const [sectors, setSectors] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [selectedSector, setSelectedSector] = useState("all")
  const [debouncedSearch, setDebouncedSearch] = useState("")

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    const params = new URLSearchParams()
    if (debouncedSearch) params.set("search", debouncedSearch)
    if (selectedSector && selectedSector !== "all") params.set("sector", selectedSector)

    setLoading(true)
    fetch(`/api/ngos/network?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setNgos(data.ngos)
          if (data.sectors?.length) setSectors(data.sectors)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [debouncedSearch, selectedSector])

  const hasActiveFilters = Boolean(debouncedSearch || (selectedSector && selectedSector !== "all"))

  const clearFilters = () => {
    setSearch("")
    setDebouncedSearch("")
    setSelectedSector("all")
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 px-6 py-8 md:px-10">
        <div className="mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">NGO Network</h1>
            <p className="mt-2 text-muted-foreground">Discover trusted NGOs with complete verification checks and connect directly.</p>
          </div>
        </div>

        <div className="mb-6 grid gap-6 md:grid-cols-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search NGOs, city, or sector"
              className="h-11 pl-8"
            />
          </div>

          <div className="flex gap-4">
            <div className="relative flex-1">
              <Select value={selectedSector} onValueChange={setSelectedSector}>
                <SelectTrigger className="h-11 w-full">
                  <SelectValue placeholder="All sectors" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sectors</SelectItem>
                  {sectors.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {hasActiveFilters ? (
              <div className="flex items-center">
                <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                  Clear
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        <div>
          <div className="mb-5 flex items-center justify-between">
            <p className="text-sm text-slate-600">
              Showing <span className="font-semibold text-slate-900">{ngos.length}</span> verified NGO{ngos.length !== 1 ? "s" : ""}
            </p>
            {selectedSector !== "all" ? (
              <Badge variant="outline" className="border-udaan-orange/40 bg-udaan-orange/10 text-udaan-orange">
                Sector: {selectedSector}
              </Badge>
            ) : null}
          </div>

          {loading ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <NGONetworkCardSkeleton key={i} />
              ))}
            </div>
          ) : ngos.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-slate-500">
              <Building2 className="mx-auto mb-4 h-12 w-12 opacity-30" />
              <p className="text-xl font-semibold text-slate-700">No NGOs found</p>
              <p className="mt-1 text-sm">Try refining your search, or clear filters to broaden results.</p>
              {hasActiveFilters ? (
                <Button type="button" variant="outline" className="mt-5" onClick={clearFilters}>
                  Reset Search
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {ngos.map((ngo) => (
                <Card key={ngo.id} className={ngoCardClassName}>
                  <CardContent className="p-2">
                    <span
                      className="inline-flex min-w-0 max-w-full overflow-hidden rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-700"
                      title={ngo.sector || "Sector not listed"}
                    >
                      <span className="block truncate">{ngo.sector || "Sector not listed"}</span>
                    </span>

                    <div className="mt-1.5 flex min-w-0 items-center gap-2 border-t border-slate-200 pt-1.5">
                      <Avatar className="h-8 w-8 shrink-0 border border-udaan-orange/25">
                        {ngo.profile_image ? (
                          <AvatarImage src={ngo.profile_image} alt={ngo.name} />
                        ) : null}
                        <AvatarFallback className="bg-udaan-orange text-[10px] font-bold text-white">
                          {getInitials(ngo.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex min-w-0 flex-1 items-center gap-1.5">
                        <Link
                          href={`/profile/${ngo.id}`}
                          className="min-w-0 truncate text-base font-semibold leading-snug text-slate-900 hover:text-udaan-navy"
                          title={ngo.name}
                        >
                          {ngo.name}
                        </Link>
                        <VerificationBadge status="verified" size="sm" showText={false} />
                      </div>
                    </div>

                    <div className="mt-1.5 min-w-0 border-t border-slate-200 pt-1.5 text-xs text-muted-foreground">
                      <div className="flex min-w-0 items-center gap-1.5 text-slate-500">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate font-medium">Location</span>
                      </div>
                      <p className="min-w-0 truncate text-[13px] font-semibold text-slate-900" title={ngo.location || "Not set"}>
                        {ngo.location || "Not set"}
                      </p>
                    </div>

                    <div className="mt-1.5 flex min-w-0 gap-2 border-t border-slate-200 pt-1.5 text-xs text-slate-900">
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <p className="min-w-0 truncate" title={ngo.registration_type || "Not set"}>
                          <span className="font-semibold">Registration:</span>{" "}
                          <span className="font-normal">{ngo.registration_type || "Not set"}</span>
                        </p>
                        <p className="min-w-0 truncate" title={ngo.email}>
                          <span className="font-semibold">Email:</span>{" "}
                          <span className="font-normal">{ngo.email}</span>
                        </p>
                      </div>

                      <span className="w-px shrink-0 self-stretch bg-slate-300" aria-hidden="true" />

                      <div className="min-w-0 flex-1 space-y-1.5">
                        <p className="min-w-0 truncate" title={formatNgoSize(ngo)}>
                          <span className="font-semibold">Size:</span>{" "}
                          <span className="font-normal">{formatNgoSize(ngo)}</span>
                        </p>
                        <p className="min-w-0 truncate" title={formatPhone(ngo.phone)}>
                          <span className="font-semibold">Phone:</span>{" "}
                          {ngo.phone && ngo.phone.trim() ? (
                            <a href={`tel:${ngo.phone}`} className="font-normal hover:text-blue-600">
                              {ngo.phone}
                            </a>
                          ) : (
                            <span className="font-normal">Not Available</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
