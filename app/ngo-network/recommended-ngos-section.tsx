"use client"

import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { NgoNetworkCard } from "./ngo-network-card"
import { NGONetworkRowSkeleton } from "./ngo-network-row-skeleton"
import type { NgoViewerContext } from "./types"
import type { RecommendedNgosState } from "./use-recommended-ngos"

export function RecommendedNgosSection({
  state,
  viewer,
}: {
  state: RecommendedNgosState
  viewer: NgoViewerContext
}) {
  const { recommended, loadingRecommended, refreshingRecommended, fetchRecommended } = state

  return (
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
                  <NgoNetworkCard key={`recommended-${ngo.id}`} ngo={ngo} {...viewer} />
                ))
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  )
}
