import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { NgoRegistrationType, VerificationFormData } from './types';

interface NgoDetailsSectionProps {
  formData: VerificationFormData;
  update: (patch: Partial<VerificationFormData>) => void;
}

export function NgoDetailsSection({ formData, update }: NgoDetailsSectionProps) {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Registration Type *</Label>
          <Select
            value={formData.ngoRegistrationType}
            onValueChange={(value) => update({ ngoRegistrationType: value as NgoRegistrationType })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select registration type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Trust">Trust</SelectItem>
              <SelectItem value="Society">Society</SelectItem>
              <SelectItem value="Section 8">Section 8</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ngoRegistrationNumber">Registration Certificate Number *</Label>
          <Input
            id="ngoRegistrationNumber"
            value={formData.registrationNumber}
            onChange={(e) => update({ registrationNumber: e.target.value })}
            placeholder="Enter registration certificate number"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="ngoPanNumber">PAN Number *</Label>
          <Input
            id="ngoPanNumber"
            value={formData.panNumber}
            maxLength={10}
            onChange={(e) => update({ panNumber: e.target.value.toUpperCase() })}
            placeholder="ABCDE1234F"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ngoFcraRegistrationNumber">FCRA Registration Number (optional)</Label>
          <Input
            id="ngoFcraRegistrationNumber"
            value={formData.ngoFcraRegistrationNumber}
            onChange={(e) => update({ ngoFcraRegistrationNumber: e.target.value })}
            placeholder="Enter FCRA registration number"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="ngoFcraExpiryDate">
            FCRA Expiry Date{formData.ngoFcraRegistrationNumber.trim() ? ' *' : ''}
          </Label>
          <Input
            id="ngoFcraExpiryDate"
            type="date"
            value={formData.ngoFcraExpiryDate}
            onChange={(e) => update({ ngoFcraExpiryDate: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ngoAssociationNumber">Association Number *</Label>
          <Input
            id="ngoAssociationNumber"
            value={formData.ngoAssociationNumber}
            onChange={(e) => update({ ngoAssociationNumber: e.target.value })}
            placeholder="Enter association number"
          />
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
        <div>
          <p className="text-sm font-medium text-slate-900">Optional compliance registration numbers</p>
          <p className="text-xs text-muted-foreground">
            Add 12A, 80G, CSR-1, or FCRA only if you have them. The CA will allot tags for certificates that
            are present and not expired. CSR recommendations and company CSR payments require a live CSR-1 tag.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="ngoTwelveANumber">12A Number (optional)</Label>
            <Input
              id="ngoTwelveANumber"
              value={formData.ngoTwelveANumber}
              onChange={(e) => update({ ngoTwelveANumber: e.target.value })}
              placeholder="Enter 12A approval/reference number"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ngoTwelveAExpiryDate">
              12A Expiry Date{formData.ngoTwelveANumber.trim() ? ' *' : ''}
            </Label>
            <Input
              id="ngoTwelveAExpiryDate"
              type="date"
              value={formData.ngoTwelveAExpiryDate}
              onChange={(e) => update({ ngoTwelveAExpiryDate: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ngoEightyGNumber">80G Number (optional)</Label>
            <Input
              id="ngoEightyGNumber"
              value={formData.ngoEightyGNumber}
              onChange={(e) => update({ ngoEightyGNumber: e.target.value })}
              placeholder="Enter 80G certificate reference"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ngoEightyGExpiryDate">
              80G Expiry Date{formData.ngoEightyGNumber.trim() ? ' *' : ''}
            </Label>
            <Input
              id="ngoEightyGExpiryDate"
              type="date"
              value={formData.ngoEightyGExpiryDate}
              onChange={(e) => update({ ngoEightyGExpiryDate: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ngoCsr1RegistrationNumber">CSR-1 Registration Number (optional)</Label>
            <Input
              id="ngoCsr1RegistrationNumber"
              value={formData.ngoCsr1RegistrationNumber}
              onChange={(e) => update({ ngoCsr1RegistrationNumber: e.target.value })}
              placeholder="Enter CSR-1 acknowledgment or registration number"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ngoCsr1ExpiryDate">
              CSR-1 Expiry Date{formData.ngoCsr1RegistrationNumber.trim() ? ' *' : ''}
            </Label>
            <Input
              id="ngoCsr1ExpiryDate"
              type="date"
              value={formData.ngoCsr1ExpiryDate}
              onChange={(e) => update({ ngoCsr1ExpiryDate: e.target.value })}
            />
          </div>
        </div>
      </div>
    </>
  );
}
