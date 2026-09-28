import { describe, expect, it } from 'vitest'
import { describeCloudSaveStatus } from '@/lib/cloud-save-status'

describe('describeCloudSaveStatus', () => {
  it('describes in-progress and failure states', () => {
    expect(describeCloudSaveStatus('saving', null)).toBe('Saving to cloud...')
    expect(describeCloudSaveStatus('offline', null)).toBe('Offline. Will sync when back online.')
    expect(describeCloudSaveStatus('error', null)).toBe('Cloud sync failed. Retrying...')
    expect(describeCloudSaveStatus('idle', '2026-09-28T10:00:00.000Z')).toBe('')
  })

  it('shows the save time instead of a counter that never advances', () => {
    const savedAt = '2026-09-28T10:05:00.000Z'
    const expectedTime = new Date(savedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

    expect(describeCloudSaveStatus('saved', savedAt)).toBe(`Saved at ${expectedTime}`)
  })

  it('falls back to a plain label without a usable timestamp', () => {
    expect(describeCloudSaveStatus('saved', null)).toBe('Saved to cloud')
    expect(describeCloudSaveStatus('saved', 'not-a-date')).toBe('Saved to cloud')
  })
})
