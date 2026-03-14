import { NextResponse } from "next/server"
import { supabase } from "@/lib/db"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET() {
  try {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const { data: recentPosts } = await supabase
      .from('posts')
      .select('created_at')
      .gte('created_at', sevenDaysAgo.toISOString())

    const { data: recentUsers, error: usersError } = await supabase
      .from('users')
      .select('created_at')
      .gte('created_at', sevenDaysAgo.toISOString())

    const { data: recentServiceRequests } = await supabase
      .from('service_requests')
      .select('created_at')
      .gte('created_at', sevenDaysAgo.toISOString())

    const { data: recentServiceOffers } = await supabase
      .from('service_offers')
      .select('created_at')
      .gte('created_at', sevenDaysAgo.toISOString())

    const growth = {
      newPosts: recentPosts?.length || 0,
      newUsers: recentUsers?.length || 0,
      newServiceRequests: recentServiceRequests?.length || 0,
      newServiceOffers: recentServiceOffers?.length || 0,
      period: '7 days'
    }

    return NextResponse.json({ success: true, growth })
  } catch (error) {
    console.error('Stats growth error:', error)
    return NextResponse.json({ success: false, growth: null })
  }
}
