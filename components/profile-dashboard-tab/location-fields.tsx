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
import { INDIAN_STATES_AND_UTS } from '@/lib/auth'
import type { ProfileDetails } from './use-profile-details'

interface HeadquartersFieldsProps {
  details: ProfileDetails
  description: string
  cityPlaceholder: string
}

export function HeadquartersFields({ details, description, cityPlaceholder }: HeadquartersFieldsProps) {
  const { addressLine, setAddressLine, city, setCity, country, setCountry, stateProvince, setStateProvince, pincode, setPincode } = details

  return (
    <>
      <p className="text-sm text-muted-foreground">
        {description}
      </p>
      <div className="space-y-4 rounded-lg border p-4">
        <div>
          <Label>Registered office address</Label>
          <Textarea
            value={addressLine}
            onChange={(e) => setAddressLine(e.target.value)}
            placeholder="Building, street, locality"
            rows={2}
          />
        </div>
        <div>
          <Label>Headquarters city / town</Label>
          <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder={cityPlaceholder} />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <Label>Country</Label>
            <Select
              value={country}
              onValueChange={(value) => {
                setCountry(value)
                if (value !== 'India') {
                  setStateProvince('')
                }
              }}
            >
              <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="India">India</SelectItem>
                <SelectItem value="Bangladesh">Bangladesh</SelectItem>
                <SelectItem value="Nepal">Nepal</SelectItem>
                <SelectItem value="Sri Lanka">Sri Lanka</SelectItem>
                <SelectItem value="Pakistan">Pakistan</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {country === 'India' ? (
            <div>
              <Label>State / UT</Label>
              <Select
                value={stateProvince || 'unset'}
                onValueChange={(value) => setStateProvince(value === 'unset' ? '' : value)}
              >
                <SelectTrigger><SelectValue placeholder="Select state or UT" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unset">Select state or UT</SelectItem>
                  {INDIAN_STATES_AND_UTS.map((stateName) => (
                    <SelectItem key={stateName} value={stateName}>{stateName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div>
              <Label>State/Province</Label>
              <Input value={stateProvince} onChange={(e) => setStateProvince(e.target.value)} placeholder="State or province" />
            </div>
          )}
          <div>
            <Label>Pincode</Label>
            <Input
              value={pincode}
              onChange={(e) => setPincode(e.target.value.replace(/[^\d]/g, '').slice(0, country === 'India' ? 6 : 10))}
              placeholder={country === 'India' ? '6-digit pincode' : 'Postal code'}
            />
          </div>
        </div>
      </div>
    </>
  )
}

export function IndividualLocationFields({ details }: { details: ProfileDetails }) {
  const { city, setCity, stateProvince, setStateProvince, pincode, setPincode, country, setCountry } = details

  return (
    <>
      <div>
        <Label>City</Label>
        <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g., Mumbai, Delhi" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label>State/Province</Label>
          <Input value={stateProvince} onChange={(e) => setStateProvince(e.target.value)} placeholder="e.g., Maharashtra, Karnataka" />
        </div>
        <div>
          <Label>Pincode</Label>
          <Input value={pincode} onChange={(e) => setPincode(e.target.value)} placeholder="e.g., 400001" />
        </div>
        <div>
          <Label>Country</Label>
          <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country" />
        </div>
      </div>
    </>
  )
}
