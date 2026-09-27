"use client"

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { MultiSelectDropdown } from '@/components/ui/multi-select-dropdown'
import { CSR_SCHEDULE_VII_CATEGORIES } from '@/lib/categories'
import type { ProfileDetails } from './use-profile-details'

export function NgoProfileFields({ details }: { details: ProfileDetails }) {
  const {
    ngoVolunteerCapacity, setNgoVolunteerCapacity,
    foundedYear, setFoundedYear,
    registrationDate, setRegistrationDate,
    sectorsScheduleVii, setSectorsScheduleVii,
    geographicCoverageAreas,
    executionCapacity,
    addGeographicArea,
    removeGeographicArea,
    updateGeographicArea,
    updateExecutionCapacityField,
  } = details

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Exact volunteer capacity</Label>
          <div className="flex gap-2">
            <Input type="number" min="0" placeholder="e.g., 42" value={ngoVolunteerCapacity} onChange={(e) => setNgoVolunteerCapacity(e.target.value)} />
            <span className="text-sm text-gray-600 self-center">people</span>
          </div>
        </div>
        <div>
          <Label>Founded Year</Label>
          <Input type="number" min="1800" max={new Date().getFullYear()} placeholder="e.g., 2010" value={foundedYear} onChange={(e) => setFoundedYear(e.target.value)} />
        </div>
      </div>
      <div>
        <Label>Registration Date</Label>
        <Input type="date" value={registrationDate} onChange={(e) => setRegistrationDate(e.target.value)} />
      </div>

      <div>
        <Label>Sectors Worked (Schedule VII)</Label>
        <MultiSelectDropdown
          value={sectorsScheduleVii}
          options={CSR_SCHEDULE_VII_CATEGORIES}
          placeholder="Select Schedule VII sectors"
          onValueChange={setSectorsScheduleVii}
        />
      </div>

      <div className="space-y-3">
        <div>
          <Label>Geographic Coverage <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <p className="mt-1 text-xs text-muted-foreground">Add each region where you operate.</p>
        </div>
        {geographicCoverageAreas.map((area, index) => (
          <div key={`profile-geo-area-${index}`} className="space-y-3 rounded-lg border bg-slate-50/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Coverage area {index + 1}</p>
              {geographicCoverageAreas.length > 1 ? (
                <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-red-600" onClick={() => removeGeographicArea(index)}>
                  Remove
                </Button>
              ) : null}
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label>Region <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input value={area.region} onChange={(e) => updateGeographicArea(index, 'region', e.target.value)} />
              </div>
              <div>
                <Label>State / UT</Label>
                <Input value={area.state} onChange={(e) => updateGeographicArea(index, 'state', e.target.value)} />
              </div>
              <div>
                <Label>District <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input value={area.district} onChange={(e) => updateGeographicArea(index, 'district', e.target.value)} />
              </div>
              <div>
                <Label>Area type <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Select
                  value={area.area_type || 'unset'}
                  onValueChange={(value) => updateGeographicArea(index, 'area_type', value === 'unset' ? '' : value)}
                >
                  <SelectTrigger><SelectValue placeholder="Select area type" /></SelectTrigger>
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
        <Button type="button" variant="outline" size="sm" onClick={addGeographicArea}>Add another coverage area</Button>
      </div>

      <div className="space-y-3">
        <div>
          <Label>Execution Capacity <span className="font-normal text-muted-foreground">(optional)</span></Label>
        </div>
        <div className="space-y-4 rounded-lg border bg-slate-50/60 p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label>Max concurrent projects</Label>
              <Input
                value={executionCapacity.concurrent_projects}
                onChange={(e) => updateExecutionCapacityField('concurrent_projects', e.target.value.replace(/[^\d]/g, ''))}
                inputMode="numeric"
                placeholder="e.g. 5"
              />
            </div>
            <div>
              <Label>Annual beneficiaries</Label>
              <Input
                value={executionCapacity.annual_beneficiaries}
                onChange={(e) => updateExecutionCapacityField('annual_beneficiaries', e.target.value.replace(/[^\d]/g, ''))}
                inputMode="numeric"
                placeholder="e.g. 10000"
              />
            </div>
            <div className="md:col-span-2">
              <Label>Delivery model</Label>
              <Select
                value={executionCapacity.delivery_model || 'unset'}
                onValueChange={(value) => updateExecutionCapacityField('delivery_model', value === 'unset' ? '' : value)}
              >
                <SelectTrigger><SelectValue placeholder="Select delivery model" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unset">Not specified</SelectItem>
                  <SelectItem value="direct">Direct delivery</SelectItem>
                  <SelectItem value="partner_led">Partner-led</SelectItem>
                  <SelectItem value="hybrid">Hybrid (direct + partners)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Additional notes</Label>
              <Textarea
                value={executionCapacity.notes}
                onChange={(e) => updateExecutionCapacityField('notes', e.target.value)}
                rows={2}
                placeholder="Partner network, reporting cadence, or other capacity details"
              />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
