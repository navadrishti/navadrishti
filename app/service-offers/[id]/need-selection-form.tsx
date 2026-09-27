import { User, Loader2 } from 'lucide-react'
import { formatPrice } from '@/lib/utils'
import { formatStatusLabel } from '@/lib/format-date'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { getNeedAmount } from './helpers'
import type { NgoNeedOption } from './types'

interface NeedSelectionFormProps {
  ngoNeeds: NgoNeedOption[]
  loadingNgoNeeds: boolean
  selectedNeedIds: number[]
  onSelectedNeedIdsChange: (ids: number[]) => void
  selectedNeedSummaries: NgoNeedOption[]
  selectedNeedTotal: number
  applying: boolean
  onApply: () => void
}

export function NeedSelectionForm({
  ngoNeeds,
  loadingNgoNeeds,
  selectedNeedIds,
  onSelectedNeedIdsChange,
  selectedNeedSummaries,
  selectedNeedTotal,
  applying,
  onApply
}: NeedSelectionFormProps) {
  return (
    <div className="space-y-5">
      <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4" />
          <span className="text-sm font-medium">Applying as NGO</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Select one active need that matches this capability type. Billing is daily rental — not a permanent sale.
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Label>Active needs</Label>
          <span className="text-xs text-muted-foreground">
            {selectedNeedIds.length ? '1 selected' : 'Choose one need'}
          </span>
        </div>

        {loadingNgoNeeds ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Loading your active needs...
          </div>
        ) : ngoNeeds.length === 0 ? (
          <Alert>
            <AlertDescription>
              You do not have any active needs yet. Create an active service request first, then return here to apply.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid gap-3">
            {ngoNeeds.map((need) => {
              const isSelected = selectedNeedIds.includes(need.id)
              const needAmount = getNeedAmount(need)
              return (
                <label
                  key={need.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${isSelected ? 'border-udaan-blue bg-gram-sage' : 'hover:bg-muted/50'}`}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(checked) => {
                      onSelectedNeedIdsChange(checked ? [need.id] : [])
                    }}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium leading-tight">{need.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {need.request_type || 'Need'} • {formatStatusLabel(need.status)}
                        </p>
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        {needAmount > 0 ? formatPrice(needAmount) : 'No budget'}
                      </Badge>
                    </div>
                  </div>
                </label>
              )
            })}
          </div>
        )}
      </div>

      {selectedNeedSummaries.length > 0 ? (
        <div className="rounded-lg border bg-white p-4 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">Selected needs</span>
            <span className="text-xs text-muted-foreground">Total {formatPrice(selectedNeedTotal)}</span>
          </div>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {selectedNeedSummaries.map((need) => (
              <li key={need.id} className="flex items-center justify-between gap-3">
                <span className="truncate">{need.title}</span>
                <span>{formatPrice(getNeedAmount(need) || 0)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Button
        onClick={onApply}
        disabled={applying || loadingNgoNeeds || ngoNeeds.length === 0 || selectedNeedIds.length === 0}
        className="w-full"
      >
        {applying ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Submitting...
          </>
        ) : ngoNeeds.length === 0 ? (
          'No active needs available'
        ) : (
          'Submit Application'
        )}
      </Button>
    </div>
  )
}
