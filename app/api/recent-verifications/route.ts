import { NextResponse } from "next/server"
import { supabase } from "@/lib/db"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET() {
  try {
    // Get recently verified NGOs with verification details
    const { data: verifiedNGOs, error: ngosError } = await supabase
      .from('ngo_verifications')
      .select(`
        id,
        user_id,
        verification_date,
        users!inner (
          id,
          name,
          email,
          profile_image
        )
      `)
      .eq('verification_status', 'verified')
      .not('verification_date', 'is', null)
      .order('verification_date', { ascending: false })
      .limit(5)

    // Get recently verified companies with verification details
    const { data: verifiedCompanies, error: companiesError } = await supabase
      .from('company_verifications')
      .select(`
        id,
        user_id,
        verification_date,
        users!inner (
          id,
          name,
          email,
          profile_image
        )
      `)
      .eq('verification_status', 'verified')
      .not('verification_date', 'is', null)
      .order('verification_date', { ascending: false })
      .limit(5)

    // Transform and combine results
    const ngosList = (verifiedNGOs || []).map(v => {
      const user = Array.isArray(v.users) ? v.users[0] : v.users
      return {
        id: user?.id || v.user_id,
        name: user?.name || 'Unknown',
        email: user?.email || '',
        profile_image: user?.profile_image,
        type: 'NGO' as const,
        created_at: v.verification_date
      }
    })

    const companiesList = (verifiedCompanies || []).map(v => {
      const user = Array.isArray(v.users) ? v.users[0] : v.users
      return {
        id: user?.id || v.user_id,
        name: user?.name || 'Unknown',
        email: user?.email || '',
        profile_image: user?.profile_image,
        type: 'Company' as const,
        created_at: v.verification_date
      }
    })

    const verifications = [...ngosList, ...companiesList]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5)

    return NextResponse.json({ success: true, verifications })
  } catch (error) {
    console.error('Verifications error:', error)
    return NextResponse.json({ success: false, verifications: [] })
  }
}
