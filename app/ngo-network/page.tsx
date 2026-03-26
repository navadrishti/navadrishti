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

  return (
    <>
      <Header />
      <main className="min-h-screen bg-gray-50">
        {/* Hero */}
        <div className="bg-udaan-navy py-10 px-4">
          <div className="max-w-5xl mx-auto">
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">NGO Network</h1>
            <p className="text-white/70 text-base mb-6">
              Verified NGOs — all three checks passed: email, mobile & documentation.
            </p>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, location or sector…"
                  className="pl-9 bg-white text-black placeholder:text-gray-400 border-0"
                />
              </div>
              {sectors.length > 0 && (
                <Select value={selectedSector} onValueChange={setSelectedSector}>
                  <SelectTrigger className="w-full sm:w-48 bg-white text-black border-0">
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
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-5xl mx-auto px-4 py-8">
          {loading ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-udaan-navy" />
            </div>
          ) : ngos.length === 0 ? (
            <div className="text-center py-20 text-gray-500">
              <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">No NGOs found</p>
              <p className="text-sm mt-1">Try adjusting your search or filters.</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-500 mb-4">
                Showing <span className="font-semibold text-gray-800">{ngos.length}</span> verified NGO{ngos.length !== 1 ? "s" : ""}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {ngos.map((ngo) => (
                  <Card key={ngo.id} className="overflow-hidden hover:shadow-md transition-shadow">
                    <CardContent className="p-5 flex flex-col gap-4">
                      {/* Top row: avatar + verification */}
                      <div className="flex items-start gap-4">
                        <Avatar className="h-14 w-14 flex-shrink-0 border-2 border-udaan-orange/30">
                          {ngo.profile_image ? (
                            <AvatarImage src={ngo.profile_image} alt={ngo.name} />
                          ) : null}
                          <AvatarFallback className="bg-gradient-to-br from-udaan-navy to-blue-600 text-white font-bold text-lg">
                            {getInitials(ngo.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Link
                              href={`/profile/${ngo.id}`}
                              className="font-semibold text-gray-900 leading-tight truncate hover:text-blue-600 transition-colors"
                            >
                              {ngo.name}
                            </Link>
                            <VerificationBadge status="verified" size="sm" showText={false} />
                          </div>
                          {ngo.sector ? (
                            <Badge variant="secondary" className="mt-1 text-xs bg-blue-50 text-blue-700 border border-blue-200">
                              {ngo.sector}
                            </Badge>
                          ) : (
                            <span className="text-xs text-gray-400 mt-1 block">No sector listed</span>
                          )}
                        </div>
                      </div>

                      {/* Location */}
                      {ngo.location ? (
                        <div className="flex items-center gap-1.5 text-sm text-gray-600">
                          <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                          <span className="truncate">{ngo.location}</span>
                        </div>
                      ) : null}

                      {/* Email button */}
                      <a
                        href={`mailto:${ngo.email}`}
                        className="mt-auto"
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full flex items-center gap-2 border-udaan-orange text-udaan-orange hover:bg-udaan-orange hover:text-white transition-colors"
                        >
                          <Mail className="h-4 w-4" />
                          Email NGO
                        </Button>
                      </a>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </>
  )
}
