import { afterEach, beforeEach } from 'vitest'
import { setLiveUserTypeOverlay } from '@/lib/auth/session'
import { overlayLiveUserType, setTestAuthOverlay } from '@/lib/server-auth'

beforeEach(() => {
  setLiveUserTypeOverlay(async (claims) => claims)
  setTestAuthOverlay(async (claims) => claims)
})

afterEach(() => {
  setLiveUserTypeOverlay(overlayLiveUserType)
  setTestAuthOverlay(null)
})
