import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useProfileSearch, type ProfileSearchResult } from '@/components/header/use-profile-search'
import { jsonResponse, mockFetch } from './helpers'
import { router } from './mocks/navigation'

const results: ProfileSearchResult[] = [
  { id: 4, name: 'Green Earth', user_type: 'ngo' },
  { id: 9, name: 'Acme', user_type: 'company' },
]

async function flushDebounce() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(150)
  })
}

describe('useProfileSearch', () => {
  it('debounces typing into a single request', async () => {
    vi.useFakeTimers()
    const fetchMock = mockFetch(() => jsonResponse({ profiles: results }))
    const { result } = renderHook(() => useProfileSearch())

    act(() => result.current.handleSearchChange('g'))
    act(() => result.current.handleSearchChange('gr'))
    act(() => result.current.handleSearchChange('green '))

    expect(result.current.searchQuery).toBe('green ')
    expect(result.current.showResults).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()

    await flushDebounce()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/search/profiles?q=green&limit=8')
    expect(result.current.searchResults).toEqual(results)
    expect(result.current.isSearching).toBe(false)
  })

  it('clears results for a blank query without fetching', async () => {
    vi.useFakeTimers()
    const fetchMock = mockFetch(() => jsonResponse({ profiles: results }))
    const { result } = renderHook(() => useProfileSearch())

    act(() => result.current.handleSearchChange('   '))
    await flushDebounce()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.searchResults).toEqual([])
  })

  it('returns no results when the request fails', async () => {
    vi.useFakeTimers()
    mockFetch(() => jsonResponse({ error: 'boom' }, 500))
    const { result } = renderHook(() => useProfileSearch())

    act(() => result.current.handleSearchChange('acme'))
    await flushDebounce()

    expect(result.current.searchResults).toEqual([])
    expect(result.current.isSearching).toBe(false)
  })

  it('navigates to the selected profile and resets state', async () => {
    vi.useFakeTimers()
    mockFetch(() => jsonResponse({ profiles: results }))
    const { result } = renderHook(() => useProfileSearch())

    act(() => result.current.handleSearchChange('acme'))
    await flushDebounce()
    act(() => result.current.handleProfileSelect(results[1]))

    expect(router.push).toHaveBeenCalledWith('/profile/9')
    expect(result.current.searchQuery).toBe('')
    expect(result.current.searchResults).toEqual([])
    expect(result.current.showResults).toBe(false)
  })

  it('clearSearch hides results', async () => {
    vi.useFakeTimers()
    mockFetch(() => jsonResponse({ profiles: results }))
    const { result } = renderHook(() => useProfileSearch())

    act(() => result.current.handleSearchChange('green'))
    await flushDebounce()
    act(() => result.current.clearSearch())

    expect(result.current.searchQuery).toBe('')
    expect(result.current.searchResults).toEqual([])
    expect(result.current.showResults).toBe(false)
  })
})
