"use client"

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
import {
  CSR_SCHEDULE_VII_CATEGORIES,
  COMPANY_CSR_GOVERNANCE_MECHANISMS,
  COMPANY_CSR_IMPLEMENTATION_MODELS,
} from '@/lib/categories'
import type { ProfileDetails } from './use-profile-details'

export function CompanyProfileFields({ details }: { details: ProfileDetails }) {
  const {
    industry, setIndustry,
    companySize, setCompanySize,
    website, setWebsite,
    sector, setSector,
    foundedYear, setFoundedYear,
    focusAreasScheduleVii, setFocusAreasScheduleVii,
    implementationModel, setImplementationModel,
    governanceMechanism, setGovernanceMechanism,
    netWorth, setNetWorth,
    turnover, setTurnover,
    netProfit, setNetProfit,
    csrVision, setCsrVision,
  } = details

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Industry</Label>
          <Select value={industry} onValueChange={setIndustry}>
            <SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="technology">Technology</SelectItem>
              <SelectItem value="healthcare">Healthcare</SelectItem>
              <SelectItem value="education">Education</SelectItem>
              <SelectItem value="manufacturing">Manufacturing</SelectItem>
              <SelectItem value="finance">Finance & Banking</SelectItem>
              <SelectItem value="retail">Retail</SelectItem>
              <SelectItem value="consulting">Consulting</SelectItem>
              <SelectItem value="media">Media & Entertainment</SelectItem>
              <SelectItem value="energy">Energy</SelectItem>
              <SelectItem value="ecommerce">E-commerce</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Company Size</Label>
          <Select value={companySize} onValueChange={setCompanySize}>
            <SelectTrigger><SelectValue placeholder="Select company size" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1-10">1-10 employees</SelectItem>
              <SelectItem value="11-50">11-50 employees</SelectItem>
              <SelectItem value="51-200">51-200 employees</SelectItem>
              <SelectItem value="201-500">201-500 employees</SelectItem>
              <SelectItem value="501-1000">501-1000 employees</SelectItem>
              <SelectItem value="1001+">1001+ employees</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Website</Label>
          <Input type="url" placeholder="https://www.yourcompany.com" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </div>
        <div>
          <Label>Sector</Label>
          <Input placeholder="e.g., CSR, Education, Healthcare" value={sector} onChange={(e) => setSector(e.target.value)} />
        </div>
      </div>
      <div>
        <Label>Founded Year</Label>
        <Input type="number" min="1800" max={new Date().getFullYear()} placeholder="e.g., 2010" value={foundedYear} onChange={(e) => setFoundedYear(e.target.value)} />
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <div>
          <h4 className="text-sm font-semibold">CSR Program Details</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Optional details that help with CSR matching.
          </p>
        </div>

        <div>
          <Label>
            Focus Areas (Schedule VII){' '}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <MultiSelectDropdown
            value={focusAreasScheduleVii}
            options={CSR_SCHEDULE_VII_CATEGORIES}
            placeholder="Select Schedule VII focus areas"
            onValueChange={setFocusAreasScheduleVii}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label>
              Implementation Model{' '}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Select
              value={implementationModel || 'unset'}
              onValueChange={(value) => setImplementationModel(value === 'unset' ? '' : value)}
            >
              <SelectTrigger><SelectValue placeholder="Select implementation model" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unset">Select implementation model</SelectItem>
                {COMPANY_CSR_IMPLEMENTATION_MODELS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>
              Governance Mechanism{' '}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Select
              value={governanceMechanism || 'unset'}
              onValueChange={(value) => setGovernanceMechanism(value === 'unset' ? '' : value)}
            >
              <SelectTrigger><SelectValue placeholder="Select governance mechanism" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unset">Select governance mechanism</SelectItem>
                {COMPANY_CSR_GOVERNANCE_MECHANISMS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label>Net Worth <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input value={netWorth} onChange={(e) => setNetWorth(e.target.value)} placeholder="e.g. INR 120 Cr" />
          </div>
          <div>
            <Label>Turnover <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input value={turnover} onChange={(e) => setTurnover(e.target.value)} placeholder="e.g. INR 450 Cr" />
          </div>
        </div>
        <div>
          <Label>Net Profit <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Input value={netProfit} onChange={(e) => setNetProfit(e.target.value)} placeholder="e.g. INR 35 Cr" />
        </div>
        <div>
          <Label>CSR Vision <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Textarea value={csrVision} onChange={(e) => setCsrVision(e.target.value)} placeholder="Describe your long-term CSR vision" rows={3} />
        </div>
      </div>
    </>
  )
}
