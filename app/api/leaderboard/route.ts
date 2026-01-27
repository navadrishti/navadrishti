import { NextResponse } from "next/server"
import { supabase } from "@/lib/db"

export const dynamic = "force-dynamic"
export const revalidate = 0 // No caching for real-time updates

export async function GET() {
  try {
    // Get all users
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, name, email, profile_image')

    if (usersError) {
      console.error('Error fetching users:', usersError)
      return NextResponse.json({ success: false, contributors: [] })
    }

    if (!users || users.length === 0) {
      return NextResponse.json({ success: true, contributors: [] })
    }

    // Calculate contribution scores for each user
    const contributorsWithScores = await Promise.all(
      users.map(async (user) => {
        let totalContributions = 0

        try {
          // Count posts
          const { count: postsCount } = await supabase
            .from('posts')
            .select('*', { count: 'exact', head: true })
            .eq('author_id', user.id)
          totalContributions += postsCount || 0

          // Count marketplace listings
          const { count: listingsCount } = await supabase
            .from('marketplace_items')
            .select('*', { count: 'exact', head: true })
            .eq('seller_id', user.id)
          totalContributions += listingsCount || 0

          // Count service requests
          const { count: requestsCount } = await supabase
            .from('service_requests')
            .select('*', { count: 'exact', head: true })
            .eq('ngo_id', user.id)
          totalContributions += requestsCount || 0

          // Count service offers
          const { count: offersCount } = await supabase
            .from('service_offers')
            .select('*', { count: 'exact', head: true })
            .eq('ngo_id', user.id)
          totalContributions += offersCount || 0

          // Count completed orders
          const { count: ordersCount } = await supabase
            .from('ecommerce_orders')
            .select('*', { count: 'exact', head: true })
            .eq('buyer_id', user.id)
            .eq('status', 'delivered')
          totalContributions += ordersCount || 0
        } catch (error) {
          // Silently ignore errors for optional tables
        }

        return {
          ...user,
          contributions: totalContributions
        }
      })
    )

    // Sort by contribution count and get top 3
    const topContributors = contributorsWithScores
      .filter(c => c.contributions > 0) // Only show users with contributions
      .sort((a, b) => b.contributions - a.contributions)
      .slice(0, 3)

    return NextResponse.json({ success: true, contributors: topContributors })
  } catch (error) {
    console.error('Leaderboard error:', error)
    return NextResponse.json({ success: false, contributors: [] })
  }
}
