export type CloudSaveStatus = 'idle' | 'saving' | 'saved' | 'offline' | 'error'

export function describeCloudSaveStatus(status: CloudSaveStatus, lastSavedAt: string | null) {
  if (status === 'saving') return 'Saving to cloud...'
  if (status === 'offline') return 'Offline. Will sync when back online.'
  if (status === 'error') return 'Cloud sync failed. Retrying...'
  if (status === 'saved') {
    const savedAt = lastSavedAt ? new Date(lastSavedAt) : null
    if (!savedAt || Number.isNaN(savedAt.getTime())) return 'Saved to cloud'
    return `Saved at ${savedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
  }
  return ''
}
