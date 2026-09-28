import { Loader2, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { VerifiedAccountName } from '@/components/verification-badge'
import type { NeedDraft, NeedRecommendation } from './types'

interface RecommendationCardProps {
  recommendation: NeedRecommendation
  isSelected: boolean
  onApply: () => void
}

function RecommendationCard({ recommendation, isSelected, onApply }: RecommendationCardProps) {
  const { offer, coverageLabel } = recommendation

  return (
    <div className={`w-full rounded-md border p-3 mb-2 text-left ${isSelected ? 'border-primary bg-primary/5' : 'border-border'}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium leading-tight">{offer.title}</p>
          <VerifiedAccountName
            name={offer.provider_name || 'Offer provider'}
            status={offer.verification_status}
            verified={offer.verified}
            size="xs"
            nameClassName="text-xs font-medium text-muted-foreground"
            className="mt-1"
          />
        </div>
        {isSelected && <CheckCircle2 size={16} className="text-primary" />}
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs">
        <span className={`rounded-full px-2 py-0.5 ${coverageLabel === 'full' ? 'bg-green-100 text-green-700' : coverageLabel === 'partial' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>
          {coverageLabel === 'full' ? 'Full' : coverageLabel === 'partial' ? 'Partial' : 'Possible'}
        </span>
        <span className="text-muted-foreground">Score {recommendation.score}</span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{recommendation.rationale}</p>
      {(recommendation.matched_keywords?.length || recommendation.matched_phrases?.length || recommendation.matched_fields?.length) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {recommendation.matched_phrases?.map((p) => (
            <span key={`phrase-${p}`} className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-800">{p}</span>
          ))}
          {recommendation.matched_keywords?.map((k) => (
            <span key={`kw-${k}`} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-800">{k}</span>
          ))}
          {recommendation.matched_fields?.map((f) => (
            <span key={`field-${f}`} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{f}</span>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center gap-2">
        <Button type="button" variant={isSelected ? 'default' : 'outline'} size="sm" onClick={onApply}>
          {isSelected ? 'Applied' : 'Apply Offer'}
        </Button>
      </div>
    </div>
  )
}

interface RelatedOffersSidebarProps {
  needs: NeedDraft[]
  offersLoading: boolean
  selectedOffersByNeed: Record<number, number[]>
  getRecommendations: (need: NeedDraft, index: number) => NeedRecommendation[]
  onRefresh: (index: number) => void
  onApply: (offerId: number, index: number) => void
}

export function RelatedOffersSidebar({
  needs,
  offersLoading,
  selectedOffersByNeed,
  getRecommendations,
  onRefresh,
  onApply
}: RelatedOffersSidebarProps) {
  const selectedCount = Object.values(selectedOffersByNeed).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0)

  return (
    <aside className="space-y-4 lg:sticky lg:top-24">
      <div className="rounded-lg border bg-background p-4">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="font-semibold">Related Service Offers</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Showing all active offers related to the selected need type. Invite one or more offers, or open an offer and apply directly.
        </p>

        <div className="mt-3 text-xs text-muted-foreground">
          Selected offers: {selectedCount}
        </div>

        <div className="mt-4 space-y-4 max-h-[420px] overflow-auto pr-1">
          {offersLoading ? (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
              <Loader2 size={16} className="mr-2 animate-spin" />
              Loading offers...
            </div>
          ) : (
            needs.map((need, idx) => {
              const top = getRecommendations(need, idx).slice(0, 2)
              return (
                <div key={`need-recs-${idx}`} className="rounded-md border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Need {idx + 1}: {need.title || '(untitled)'}</p>
                      <p className="text-xs text-muted-foreground">Showing top {top.length} recommendation(s)</p>
                    </div>
                    <div>
                      <Button type="button" size="sm" variant="outline" onClick={() => onRefresh(idx)}>
                        Refresh
                      </Button>
                    </div>
                  </div>
                  {top.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No recommendations available.</p>
                  ) : (
                    top.map((recommendation) => (
                      <RecommendationCard
                        key={recommendation.offer.id}
                        recommendation={recommendation}
                        isSelected={(selectedOffersByNeed[idx] || []).includes(recommendation.offer.id)}
                        onApply={() => onApply(recommendation.offer.id, idx)}
                      />
                    ))
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </aside>
  )
}
