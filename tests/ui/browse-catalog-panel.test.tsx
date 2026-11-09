import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BrowseCatalogPanel } from '@/components/browse-catalog-panel'
import { catalogBudgetBucket, matchesCatalogQuery, splitLocation } from '@/lib/catalog-filters'

const items = [
  { id: '1', name: 'Alpha Trust' },
  { id: '2', name: 'Beta Foundation' },
  { id: '3', name: 'Gamma Society' },
  { id: '4', name: 'Delta Mission' },
]

describe('BrowseCatalogPanel', () => {
  it('shows three items until load more enables the rest in the same panel', () => {
    render(
      <BrowseCatalogPanel
        title="NGOs"
        items={items}
        getItemKey={(item) => item.id}
        getSearchText={(item) => item.name}
        searchPlaceholder="Search NGOs"
        empty="No NGOs are registered on the platform yet."
        renderItem={(item) => <p>{item.name}</p>}
      />,
    )

    expect(screen.getByText('Alpha Trust')).toBeInTheDocument()
    expect(screen.getByText('Gamma Society')).toBeInTheDocument()
    expect(screen.queryByText('Delta Mission')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Load more (1)' }))
    expect(screen.getByText('Delta Mission')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Load more/ })).not.toBeInTheDocument()
  })

  it('filters by search without ranking copy', () => {
    render(
      <BrowseCatalogPanel
        title="Capability Offers"
        items={items}
        getItemKey={(item) => item.id}
        getSearchText={(item) => item.name}
        searchPlaceholder="Search offers"
        empty="No capability offers are listed on the platform yet."
        renderItem={(item) => <p>{item.name}</p>}
      />,
    )

    fireEvent.change(screen.getByLabelText('Search offers'), { target: { value: 'delta' } })
    expect(screen.getByText('Delta Mission')).toBeInTheDocument()
    expect(screen.queryByText('Alpha Trust')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Load more/ })).not.toBeInTheDocument()
  })
})

describe('matchesCatalogQuery', () => {
  it('matches every token in the haystack', () => {
    expect(matchesCatalogQuery('Education NGO Mumbai', 'edu mum')).toBe(true)
    expect(matchesCatalogQuery('Education NGO Mumbai', 'delhi')).toBe(false)
  })
})

describe('catalog filter helpers', () => {
  it('splits city and state from a location summary', () => {
    expect(splitLocation('Mumbai, Maharashtra, 400001, India')).toEqual({ city: 'Mumbai', state: 'Maharashtra' })
  })

  it('buckets budgets for filter options', () => {
    expect(catalogBudgetBucket(12000)).toBe('under_25000')
    expect(catalogBudgetBucket(80000)).toBe('25000_100000')
    expect(catalogBudgetBucket(250000)).toBe('100000_500000')
    expect(catalogBudgetBucket(900000)).toBe('500000_plus')
  })
})
