import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { setLiveUserTypeOverlay } from '@/lib/auth/session'
import { assertSecretKey } from '@/lib/runtime-services'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || ''

assertSecretKey(supabaseUrl, supabaseSecretKey)

export const supabase = createClient<Database>(supabaseUrl, supabaseSecretKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

/** Server-side Supabase client (same instance as `supabase`). */
export function createServerClient() {
  return supabase
}

setLiveUserTypeOverlay(async (claims) => {
  const { overlayLiveUserType } = await import('@/lib/server-auth')
  return overlayLiveUserType(claims)
})
