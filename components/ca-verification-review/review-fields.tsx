import { certificateExpiryCopy } from '@/lib/auth'

export function ReviewField({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      <p className="text-sm text-slate-600">{value || 'Not set'}</p>
    </div>
  )
}

export function ExpiryLines({ value }: { value?: string }) {
  const copy = certificateExpiryCopy(value)
  if (!copy.expiry_label) {
    return <p className="text-sm text-slate-600">Not set</p>
  }
  return (
    <>
      <p className="text-sm text-slate-600">Expiry date: {copy.expiry_label}</p>
      <p className="text-sm text-slate-600">Days remaining: {copy.days_line}</p>
    </>
  )
}

export function ExpiryReviewField({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      <ExpiryLines value={value} />
    </div>
  )
}
