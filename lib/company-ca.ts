import { supabase } from '@/lib/db'

export async function verifyCompanyCA(token: string) {
  try {
    // This mirrors the existing verify flow used elsewhere: look up identity by token
    const { data } = await supabase.from('company_ca_identities').select('*, users(*)').eq('auth_token', token).maybeSingle()
    if (!data) return { success: false }
    if (!data.active) return { success: false }
    return { success: true, company_ca: data }
  } catch (e) {
    console.error('Company CA verify error:', e)
    return { success: false }
  }
}
