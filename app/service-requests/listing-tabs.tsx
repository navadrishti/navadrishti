'use client'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ListingKind } from './types'

const LISTING_TABS: { value: ListingKind; title: string; subtitle: string }[] = [
  { value: 'needs', title: 'Needs', subtitle: 'For individuals to fulfil' },
  { value: 'projects', title: 'Projects', subtitle: 'For company CSR takeover' },
]

export function ListingTabs({
  listingKind,
  onChange,
}: {
  listingKind: ListingKind
  onChange: (value: string) => void
}) {
  return (
    <div className="mb-8 rounded-lg border border-gram-border bg-white p-2 shadow-sm">
      <Tabs value={listingKind} onValueChange={onChange}>
        <TabsList className="grid h-auto w-full grid-cols-2 gap-2 bg-transparent p-0">
          {LISTING_TABS.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="flex h-full min-h-[5.25rem] w-full min-w-0 flex-col items-center justify-center gap-1 rounded-md border border-transparent px-3 py-3 text-center data-[state=active]:border-udaan-blue data-[state=active]:bg-udaan-blue data-[state=active]:text-white data-[state=active]:shadow-none data-[state=inactive]:bg-[#F4F5F3] data-[state=inactive]:text-gram-body sm:items-start sm:px-4 sm:text-left"
            >
              <span className="text-base font-semibold">{tab.title}</span>
              <span
                className={`w-full text-xs font-normal leading-snug ${
                  listingKind === tab.value ? 'text-white/85' : 'text-gram-muted'
                }`}
              >
                {tab.subtitle}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  )
}
