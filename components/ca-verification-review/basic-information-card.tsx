import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ExpiryReviewField, ReviewField } from './review-fields'
import type { CAReviewEntityType, CAReviewItem } from './types'

export function BasicInformationCard({ item, type }: { item: CAReviewItem; type: CAReviewEntityType }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Basic Information</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {type === 'individuals' && (
            <>
              <ReviewField label="Full Name" value={item.name} />
              <ReviewField label="Aadhaar Number" value={item.aadhaar} />
              <ReviewField label="PAN Number" value={item.pan} />
              <ReviewField label="Email" value={item.email} />
              <ReviewField label="Phone" value={item.phone} />
            </>
          )}
          {type === 'companies' && (
            <>
              <ReviewField label="Company Name" value={item.company_name} />
              <ReviewField label="GST Number" value={item.gst} />
              <ReviewField label="PAN Number" value={item.pan} />
              <ReviewField label="CIN" value={item.cin} />
              <ReviewField label="Email" value={item.email} />
              <ReviewField label="Phone" value={item.phone} />
            </>
          )}
          {type === 'ngos' && (
            <>
              <ReviewField label="NGO Name" value={item.ngo_name} />
              <ReviewField label="Registration Number" value={item.registration_number} />
              <ReviewField label="FCRA Number" value={item.fcra_number} />
              <ExpiryReviewField label="FCRA Expiry" value={item.fcra_expiry} />
              <ReviewField label="PAN Number" value={item.pan} />
              <ReviewField label="12A Number" value={item.twelve_a} />
              <ExpiryReviewField label="12A Expiry" value={item.twelve_a_expiry} />
              <ReviewField label="80G Number" value={item.eighty_g} />
              <ExpiryReviewField label="80G Expiry" value={item.eighty_g_expiry} />
              <ReviewField label="CSR-1 Registration Number" value={item.csr1} />
              <ExpiryReviewField label="CSR-1 Expiry" value={item.csr1_expiry} />
              <ReviewField label="Email" value={item.email} />
              <ReviewField label="Phone" value={item.phone} />
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
