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
import { MapPin, Mail, Search, Building2, Loader2 } from "lucide-react"
import { VerificationBadge } from "@/components/verification-badge"

interface NGO {
  id: number
  name: string
  email: string
  profile_image: string | null
  location: string | null
  sector: string | null
}

function getInitials(name: string) {
  if (!name) return "N"
  const parts = name.trim().split(" ")
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function NGONetworkPage() {
  const [ngos, setNgos] = useState<NGO[]>([])
  const [sectors, setSectors] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [selectedSector, setSelectedSector] = useState("all")
  const [debouncedSearch, setDebouncedSearch] = useState("")

  // Debounce search
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
    <>
      <Header />
      <main className="min-h-screen bg-slate-100">
        <section className="bg-udaan-blue px-4 pb-10 pt-12">
          <div className="mx-auto max-w-6xl">
            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-white/70">Verified Directory</p>
                <h1 className="mt-2 text-4xl font-extrabold leading-tight text-white md:text-5xl">NGO Network</h1>
                <p className="mt-3 max-w-2xl text-base text-white/80 md:text-lg">
                  Discover trusted NGOs with complete verification checks and connect directly.
                </p>
              </div>

            </div>

            <div className="mt-8 rounded-2xl border border-white/15 bg-white/95 p-4 shadow-xl shadow-black/15">
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by NGO name, city, state or sector"
                    className="h-11 border-slate-200 bg-white pl-9 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>

                {sectors.length > 0 && (
                  <Select value={selectedSector} onValueChange={setSelectedSector}>
                    <SelectTrigger className="h-11 w-full border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 md:w-56">
                      <SelectValue placeholder="All sectors" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All sectors</SelectItem>
                      {sectors.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {hasActiveFilters ? (
                  <Button type="button" variant="outline" className="h-11 border-slate-200" onClick={clearFilters}>
                    Clear Filters
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-8">
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((idx) => (
                <div key={idx} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 h-14 w-14 animate-pulse rounded-full bg-slate-200" />
                  <div className="mb-2 h-5 w-3/4 animate-pulse rounded bg-slate-200" />
                  <div className="mb-4 h-4 w-1/2 animate-pulse rounded bg-slate-100" />
                  <div className="mb-6 h-4 w-2/3 animate-pulse rounded bg-slate-100" />
                  <div className="h-10 w-full animate-pulse rounded-lg bg-slate-200" />
                </div>
              ))}
            </div>
          ) : ngos.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-slate-500 shadow-sm">
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {ngos.map((ngo, index) => (
                <Card
                  key={ngo.id}
                  className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
                  style={{ animationDelay: `${index * 40}ms` }}
                >
                  <CardContent className="flex h-full flex-col p-5">
                    <div className="mb-4 flex items-start gap-4">
                      <Avatar className="h-14 w-14 flex-shrink-0 border-2 border-udaan-orange/25">
                        {ngo.profile_image ? (
                          <AvatarImage src={ngo.profile_image} alt={ngo.name} />
                        ) : null}
                        <AvatarFallback className="bg-gradient-to-br from-udaan-navy via-blue-600 to-cyan-500 text-lg font-bold text-white">
                          {getInitials(ngo.name)}
                        </AvatarFallback>
                      </Avatar>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <Link
                            href={`/profile/${ngo.id}`}
                            className="truncate text-lg font-semibold text-slate-900 transition-colors hover:text-udaan-navy"
                          >
                            {ngo.name}
                          </Link>
                          <VerificationBadge status="verified" size="sm" showText={false} />
                        </div>

                        {ngo.sector ? (
                          <Badge variant="secondary" className="mt-2 border border-blue-200 bg-blue-50 text-blue-700">
                            {ngo.sector}
                          </Badge>
                        ) : (
                          <p className="mt-2 text-xs text-slate-400">No sector listed</p>
                        )}
                      </div>
                    </div>

                    <div className="mb-4 space-y-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 text-slate-400" />
                        <span className="truncate">{ngo.location || "Location not specified"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5 text-slate-400" />
                        <span className="truncate">{ngo.email}</span>
                      </div>
                    </div>

                    <div className="mt-auto flex gap-2">
                      <Link href={`/profile/${ngo.id}`} className="flex-1">
                        <Button variant="outline" className="w-full border-slate-300 text-slate-700 hover:bg-slate-100">
                          View Profile
                        </Button>
                      </Link>
                      <a href={`mailto:${ngo.email}`} className="flex-1">
                        <Button className="w-full bg-udaan-orange text-white hover:bg-udaan-orange/90">
                          Contact
                        </Button>
                      </a>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  )
}
