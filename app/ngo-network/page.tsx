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
import { Search, Building2 } from "lucide-react"
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
  "flex h-full w-full flex-col rounded-md border-2 border-slate-200 bg-white shadow-none"

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

function NGONetworkCardSkeleton() {
  return (
    <Card className={ngoCardClassName}>
      <CardContent className="flex flex-1 flex-col p-2">
        <Skeleton className="h-5 w-28 self-start rounded-full" />

        <div className="mt-1.5 flex min-w-0 items-center gap-2 border-t border-slate-200 pt-1.5">
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <Skeleton className="h-5 flex-1 rounded" />
            <Skeleton className="h-4 w-4 shrink-0 rounded-full" />
          </div>
        </div>

        <div className="mt-1.5 min-w-0 border-t border-slate-200 pt-1.5">
          <Skeleton className="h-3 w-10 rounded" />
          <Skeleton className="mt-0.5 h-4 w-full rounded" />
        </div>

        <div className="mt-1.5 grid grid-cols-2 gap-x-2 border-t border-slate-200 pt-1.5">
          <Skeleton className="h-3 w-full rounded" />
          <Skeleton className="h-3 w-full rounded" />
        </div>

        <div className="mt-1.5 grid grid-cols-2 gap-x-2 border-t border-slate-200 pt-1.5">
          <Skeleton className="h-3 w-full rounded" />
          <Skeleton className="h-3 w-full rounded" />
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
            <div className="grid items-stretch gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
            <div className="grid items-stretch gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {ngos.map((ngo) => (
                <Card key={ngo.id} className={ngoCardClassName}>
                  <CardContent className="flex flex-1 flex-col p-2">
                    <span
                      className="inline-flex w-fit max-w-full self-start overflow-hidden rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-700"
                      title={ngo.sector || "Sector not listed"}
                    >
                      <span className="truncate">{ngo.sector || "Sector not listed"}</span>
                    </span>

                    <div className="mt-1.5 flex min-h-[2rem] items-center gap-2 border-t border-slate-200 pt-1.5">
                      <Avatar className="h-8 w-8 shrink-0 border border-udaan-orange/25">
                        {ngo.profile_image ? (
                          <AvatarImage src={ngo.profile_image} alt={ngo.name} />
                        ) : null}
                        <AvatarFallback className="bg-udaan-orange text-[10px] font-bold text-white">
                          {getInitials(ngo.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
                        <Link
                          href={`/profile/${ngo.id}`}
                          className="min-w-0 truncate text-base font-semibold leading-none text-slate-900 hover:text-udaan-navy"
                          title={ngo.name}
                        >
                          {ngo.name}
                        </Link>
                        <VerificationBadge status="verified" size="sm" showText={false} className="shrink-0" />
                      </div>
                    </div>

                    <div className="mt-1.5 min-h-[3.25rem] border-t border-slate-200 pt-1.5 text-xs text-muted-foreground">
                      <div className="text-slate-500">
                        <span className="font-medium">Location</span>
                      </div>
                      <p
                        className="mt-0.5 line-clamp-2 text-[13px] font-semibold leading-snug text-slate-900"
                        title={ngo.location || "Not set"}
                      >
                        {ngo.location || "Not set"}
                      </p>
                    </div>

                    <div className="mt-1.5 grid min-h-[2.5rem] grid-cols-2 gap-x-2 border-t border-slate-200 pt-1.5 text-xs text-slate-900">
                      <p className="line-clamp-2 min-w-0 leading-snug" title={ngo.registration_type || "Not set"}>
                        <span className="font-semibold">Registration:</span>{" "}
                        <span className="font-normal">{ngo.registration_type || "Not set"}</span>
                      </p>
                      <p className="line-clamp-2 min-w-0 leading-snug" title={formatNgoSize(ngo)}>
                        <span className="font-semibold">Size:</span>{" "}
                        <span className="font-normal">{formatNgoSize(ngo)}</span>
                      </p>
                    </div>

                    <div className="mt-auto grid min-h-[2.75rem] grid-cols-2 gap-x-2 border-t border-slate-200 pt-1.5 text-xs text-slate-900">
                      <p className="min-w-0 leading-snug">
                        <span className="font-semibold">Email:</span>{" "}
                        <a
                          href={`mailto:${ngo.email}`}
                          className="mt-0.5 block line-clamp-2 break-all font-normal hover:text-blue-600"
                          title={ngo.email}
                        >
                          {ngo.email}
                        </a>
                      </p>
                      <p className="min-w-0 leading-snug">
                        <span className="font-semibold">Phone:</span>{" "}
                        {ngo.phone && ngo.phone.trim() ? (
                          <a
                            href={`tel:${ngo.phone}`}
                            className="mt-0.5 block line-clamp-2 break-all font-normal hover:text-blue-600"
                            title={ngo.phone}
                          >
                            {ngo.phone}
                          </a>
                        ) : (
                          <span className="mt-0.5 block font-normal">Not Available</span>
                        )}
                      </p>
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
