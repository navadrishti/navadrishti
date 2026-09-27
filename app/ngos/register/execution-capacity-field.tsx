import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { NgoExecutionCapacity } from '@/lib/auth'

type ExecutionCapacityFieldProps = {
  capacity: NgoExecutionCapacity
  onUpdate: (field: keyof NgoExecutionCapacity, value: string) => void
}

const digitsOnly = (value: string) => value.replace(/[^\d]/g, '')

export function ExecutionCapacityField({ capacity, onUpdate }: ExecutionCapacityFieldProps) {
  return (
    <div className="space-y-3 md:col-span-2">
      <div>
        <Label>
          Execution Capacity <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <p className="mt-1 text-xs text-muted-foreground">
          Share how much work your NGO can take on. All fields are optional.
        </p>
      </div>

      <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="executionConcurrentProjects">
              Max concurrent projects <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="executionConcurrentProjects"
              value={capacity.concurrent_projects}
              onChange={(e) => onUpdate('concurrent_projects', digitsOnly(e.target.value))}
              inputMode="numeric"
              placeholder="e.g. 5"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="executionAnnualBeneficiaries">
              Annual beneficiaries <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="executionAnnualBeneficiaries"
              value={capacity.annual_beneficiaries}
              onChange={(e) => onUpdate('annual_beneficiaries', digitsOnly(e.target.value))}
              inputMode="numeric"
              placeholder="e.g. 10000"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="executionDeliveryModel">
              Delivery model <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Select
              value={capacity.delivery_model || 'unset'}
              onValueChange={(value) => onUpdate('delivery_model', value === 'unset' ? '' : value)}
            >
              <SelectTrigger id="executionDeliveryModel">
                <SelectValue placeholder="Select delivery model" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unset">Not specified</SelectItem>
                <SelectItem value="direct">Direct delivery</SelectItem>
                <SelectItem value="partner_led">Partner-led</SelectItem>
                <SelectItem value="hybrid">Hybrid (direct + partners)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="executionNotes">
              Additional notes <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="executionNotes"
              value={capacity.notes}
              onChange={(e) => onUpdate('notes', e.target.value)}
              placeholder="Partner network, reporting cadence, or other capacity details"
              rows={2}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
