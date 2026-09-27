import type { ReactNode } from 'react';
import { PHONE_VERIFICATION_ENABLED } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NgoDetailsSection } from './ngo-details-section';
import type { SetFormData, VerificationFormData } from './types';

interface DetailsStepProps {
  formData: VerificationFormData;
  setFormData: SetFormData;
  contactVerification: ReactNode;
  onContinue: () => void;
}

export function DetailsStep({ formData, setFormData, contactVerification, onContinue }: DetailsStepProps) {
  const update = (patch: Partial<VerificationFormData>) => setFormData((prev) => ({ ...prev, ...patch }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Add Details
        </CardTitle>
        <CardDescription>
          Fill all required details for your verification type.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="entityName">Full Name</Label>
            <Input
              id="entityName"
              value={formData.entityName}
              onChange={(e) => update({ entityName: e.target.value })}
              placeholder="Enter name"
            />
          </div>
          {PHONE_VERIFICATION_ENABLED ? (
            <div className="space-y-2">
              <Label htmlFor="contactNumber">Contact Number</Label>
              <Input
                id="contactNumber"
                value={formData.contactNumber}
                onChange={(e) => update({ contactNumber: e.target.value })}
                placeholder="Enter contact number"
              />
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => update({ email: e.target.value })}
            placeholder="Enter email"
          />
        </div>

        {contactVerification}

        {formData.category === 'individual' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="aadhaarNumber">Aadhaar Number *</Label>
              <Input
                id="aadhaarNumber"
                value={formData.aadhaarNumber}
                maxLength={12}
                onChange={(e) => update({ aadhaarNumber: e.target.value.replace(/\D/g, '') })}
                placeholder="12-digit Aadhaar number"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="individualPanNumber">PAN Number *</Label>
              <Input
                id="individualPanNumber"
                value={formData.panNumber}
                maxLength={10}
                onChange={(e) => update({ panNumber: e.target.value.toUpperCase() })}
                placeholder="ABCDE1234F"
              />
            </div>
          </div>
        )}

        {formData.category === 'ngo' && <NgoDetailsSection formData={formData} update={update} />}

        {formData.category === 'company' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="companyRegistrationNumber">Registration / Incorporation Number</Label>
                <Input
                  id="companyRegistrationNumber"
                  value={formData.registrationNumber}
                  onChange={(e) => update({ registrationNumber: e.target.value })}
                  placeholder="Enter registration number"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="companyPanNumber">PAN Number</Label>
                <Input
                  id="companyPanNumber"
                  value={formData.panNumber}
                  maxLength={10}
                  onChange={(e) => update({ panNumber: e.target.value.toUpperCase() })}
                  placeholder="ABCDE1234F"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="companyCinNumber">CIN Number *</Label>
                <Input
                  id="companyCinNumber"
                  value={formData.companyCinNumber}
                  onChange={(e) => update({ companyCinNumber: e.target.value.toUpperCase() })}
                  placeholder="L99999MH2020PTC123456"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="companyGstApplicable">GST Applicable</Label>
                <div className="h-10 flex items-center gap-2 px-3 border rounded-md">
                  <Input
                    id="companyGstApplicable"
                    type="checkbox"
                    checked={formData.companyGstApplicable}
                    onChange={(e) => update({ companyGstApplicable: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm text-gray-700">Upload GST Certificate if applicable</span>
                </div>
              </div>
            </div>
            {formData.companyGstApplicable && (
              <div className="space-y-2">
                <Label htmlFor="companyGstNumber">GST Number *</Label>
                <Input
                  id="companyGstNumber"
                  value={formData.companyGstNumber}
                  maxLength={15}
                  onChange={(e) => update({ companyGstNumber: e.target.value.toUpperCase() })}
                  placeholder="22AAAAA0000A1Z5"
                />
              </div>
            )}
          </>
        )}

        <div className="flex justify-end">
          <Button onClick={onContinue}>
            Continue to Uploads
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
