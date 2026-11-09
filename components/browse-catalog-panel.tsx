'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StyledSelect } from '@/components/ui/styled-select'
import {
  matchesCatalogQuery,
  type CatalogFilterOption,
} from '@/lib/catalog-filters'
import { cn } from '@/lib/utils'

export const CATALOG_PAGE_SIZE = 3

export type CatalogFilter = {
  id: string
  label: string
  value: string
  options: CatalogFilterOption[]
  onChange: (value: string) => void
}

function CatalogSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: CatalogFilterOption[]
  onChange: (value: string) => void
}) {
  return (
    <StyledSelect
      value={value}
      options={options}
      placeholder={label}
      ariaLabel={label}
      onValueChange={onChange}
      className="h-8 rounded-xl border-slate-200 bg-white px-2.5 text-xs shadow-sm hover:bg-white"
    />
  )
}

export function BrowseCatalogPanel<T>({
  title,
  description,
  loading = false,
  error = null,
  items,
  getItemKey,
  getSearchText,
  renderItem,
  searchPlaceholder = 'Search',
  filters = [],
  empty,
  className,
}: {
  title: string
  description?: string
  loading?: boolean
  error?: string | null
  items: T[]
  getItemKey: (item: T) => string
  getSearchText: (item: T) => string
  renderItem: (item: T) => ReactNode
  searchPlaceholder?: string
  filters?: CatalogFilter[]
  empty: string
  className?: string
}) {
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [viewportHeight, setViewportHeight] = useState<number | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(
    () => items.filter((item) => matchesCatalogQuery(getSearchText(item), search)),
    [getSearchText, items, search],
  )

  useEffect(() => {
    setExpanded(false)
    setViewportHeight(null)
  }, [search, items])

  const visible = expanded ? filtered : filtered.slice(0, CATALOG_PAGE_SIZE)
  const remaining = Math.max(0, filtered.length - CATALOG_PAGE_SIZE)
  const showAllLabel = expanded && filtered.length > CATALOG_PAGE_SIZE

  return (
    <div className={cn('rounded-2xl border border-slate-200 bg-slate-50 p-4', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-950">{title}</p>
          {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
        </div>
        {loading ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-slate-500" /> : null}
      </div>

      <div className="mt-3 space-y-2">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={searchPlaceholder}
          className="h-8 bg-white text-xs"
          aria-label={searchPlaceholder}
        />
        {filters.length > 0 ? (
          <div className={cn('grid gap-2', filters.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
            {filters.map((filter) => (
              <CatalogSelect
                key={filter.id}
                label={filter.label}
                value={filter.value}
                options={filter.options}
                onChange={filter.onChange}
              />
            ))}
          </div>
        ) : null}
      </div>

      <div
        ref={listRef}
        className={cn('mt-3 space-y-2', expanded && viewportHeight ? 'overflow-y-auto overscroll-contain pr-1' : null)}
        style={expanded && viewportHeight ? { height: viewportHeight } : undefined}
      >
        {error ? (
          <div className="rounded-xl border border-red-200 bg-white p-3 text-sm text-red-700">{error}</div>
        ) : visible.length > 0 ? (
          visible.map((item) => <div key={getItemKey(item)}>{renderItem(item)}</div>)
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
            {loading ? 'Loading…' : empty}
          </div>
        )}
      </div>

      {!error && remaining > 0 && !expanded ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 h-9 w-full"
          onClick={() => {
            const height = listRef.current?.offsetHeight || 0
            if (height > 0) setViewportHeight(height)
            setExpanded(true)
          }}
        >
          Load more ({remaining})
        </Button>
      ) : showAllLabel ? (
        <p className="mt-3 flex h-9 items-center justify-center text-xs text-slate-500">
          Showing all {filtered.length}
        </p>
      ) : null}
    </div>
  )
}
