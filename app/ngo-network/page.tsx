"use client"

import { useState } from "react"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { NgoPayDialog } from "@/components/ngo-pay-dialog"
import { useAuth } from "@/lib/auth-context"
import { isCaVerifiedAccount } from "@/lib/auth"
import { NgoFiltersSection } from "./ngo-filters-section"
import { NgoNetworkCard } from "./ngo-network-card"
import { NGONetworkRowSkeleton } from "./ngo-network-row-skeleton"
import { RecommendedNgosSection } from "./recommended-ngos-section"
import { useNgoNetwork } from "./use-ngo-network"
import { useRecommendedNgos } from "./use-recommended-ngos"
import type { NetworkNgo, NgoViewerContext } from "./types"

export default function NGONetworkPage() {
  const { user } = useAuth()
  const network = useNgoNetwork()
  const recommendedState = useRecommendedNgos(user?.id)
  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const [payingNgo, setPayingNgo] = useState<NetworkNgo | null>(null)

  const openPayDialog = (ngo: NetworkNgo) => {
    setPayingNgo(ngo)
    setPayDialogOpen(true)
  }

  const viewer: NgoViewerContext = {
    canPay: user?.user_type === "individual" || user?.user_type === "company",
    payerCaVerified: isCaVerifiedAccount(user?.verification_status),
    isNgoViewer: user?.user_type === "ngo",
    userId: user?.id,
    userType: user?.user_type,
    onPay: openPayDialog,
  }

  const { ngos, loading, hasActiveFilters, clearFilters } = network

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 px-6 py-8 md:px-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">NGO Network</h1>
          <p className="text-muted-foreground">
            Discover verified NGOs, review their profiles and contact details, then pay them directly via GRAM.
          </p>
        </div>

        {user?.id ? <RecommendedNgosSection state={recommendedState} viewer={viewer} /> : null}

        <NgoFiltersSection network={network} />

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
            ngos.map((ngo) => <NgoNetworkCard key={ngo.id} ngo={ngo} {...viewer} />)
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
