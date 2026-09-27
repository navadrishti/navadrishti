import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { NgoGeographicCoverageArea } from '@/lib/auth'

type GeographicCoverageFieldProps = {
  areas: NgoGeographicCoverageArea[]
  onUpdate: (index: number, field: keyof NgoGeographicCoverageArea, value: string) => void
  onAdd: () => void
  onRemove: (index: number) => void
}

export function GeographicCoverageField({ areas, onUpdate, onAdd, onRemove }: GeographicCoverageFieldProps) {
  return (
    <div className="space-y-3 md:col-span-2">
      <div>
        <Label>
          Geographic Coverage <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <p className="mt-1 text-xs text-muted-foreground">
          Add each region where you operate with state, district, and area type.
        </p>
      </div>

      {areas.map((area, index) => (
        <div
          key={`geographic-area-${index}`}
          className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-slate-900">Coverage area {index + 1}</p>
            {areas.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-red-600 hover:text-red-700"
                onClick={() => onRemove(index)}
              >
                Remove
              </Button>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`geoRegion-${index}`}>
                Region <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id={`geoRegion-${index}`}
                value={area.region}
                onChange={(e) => onUpdate(index, 'region', e.target.value)}
                placeholder="e.g. Western Maharashtra, North East"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`geoState-${index}`}>State / UT</Label>
              <Input
                id={`geoState-${index}`}
                value={area.state}
                onChange={(e) => onUpdate(index, 'state', e.target.value)}
                placeholder="e.g. Maharashtra"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`geoDistrict-${index}`}>
                District <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id={`geoDistrict-${index}`}
                value={area.district}
                onChange={(e) => onUpdate(index, 'district', e.target.value)}
                placeholder="e.g. Pune, Kamrup"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`geoAreaType-${index}`}>
                Area type <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Select
                value={area.area_type || 'unset'}
                onValueChange={(value) => onUpdate(index, 'area_type', value === 'unset' ? '' : value)}
              >
                <SelectTrigger id={`geoAreaType-${index}`}>
                  <SelectValue placeholder="Select area type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unset">Not specified</SelectItem>
                  <SelectItem value="urban">Urban</SelectItem>
                  <SelectItem value="rural">Rural</SelectItem>
                  <SelectItem value="both">Urban & rural</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" onClick={onAdd}>
        Add another coverage area
      </Button>
    </div>
  )
}
