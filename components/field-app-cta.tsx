'use client'

import { Button } from '@/components/ui/button'

/** Opens the GRAM field PWA when NEXT_PUBLIC_PWA_URL is configured. */
export function FieldAppCta({
  className,
  label = 'Open GRAM App',
  hint = 'Mark attendance and submit field evidence from the mobile app. Pending uploads sync when you are back online — they do not sync after the app is closed.',
  unavailableHint = 'Field attendance and evidence capture use the GRAM App. Ask your administrator to set NEXT_PUBLIC_PWA_URL.',
}: {
  className?: string
  label?: string
  hint?: string
  unavailableHint?: string
}) {
  const pwaUrl = String(process.env.NEXT_PUBLIC_PWA_URL || '').trim()

  if (!pwaUrl) {
    return (
      <div className={className}>
        <p className="text-sm text-amber-800">
          {unavailableHint}
        </p>
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="flex flex-col gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">{hint}</p>
        <Button size="sm" asChild className="shrink-0">
          <a href={pwaUrl} target="_blank" rel="noopener noreferrer">
            {label}
          </a>
        </Button>
      </div>
    </div>
  )
}
