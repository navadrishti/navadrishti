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
import { SkeletonProfileCard } from '@/components/ui/skeleton'
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
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonProfileCard key={i} />
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
                  className="rounded-lg border border-slate-200 bg-white"
                  style={{ animationDelay: `${index * 40}ms` }}
                >
                  <CardContent className="flex h-full flex-col p-4">
                    <div className="mb-4 flex items-start gap-4">
                      <Avatar className="h-14 w-14 flex-shrink-0 border-2 border-udaan-orange/25">
                        {ngo.profile_image ? (
                          <AvatarImage src={ngo.profile_image} alt={ngo.name} />
                        ) : null}
                        <AvatarFallback className="bg-udaan-orange text-lg font-bold text-white">
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
        </div>
      </main>
    </div>
  )
}
