import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY!

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
