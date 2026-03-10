import { NextResponse } from "next/server"
import { supabase } from "@/lib/db"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET() {
  try {
    // Get user growth over last 7 days
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

    const { data: recentListings, error: listingsError } = await supabase
      .from('marketplace_items')
      .select('created_at')
      .gte('created_at', sevenDaysAgo.toISOString())

    const { data: recentOrders, error: ordersError } = await supabase
      .from('ecommerce_orders')
      .select('created_at')
      .gte('created_at', sevenDaysAgo.toISOString())

    const growth = {
      newPosts: recentPosts?.length || 0,
      newUsers: recentUsers?.length || 0,
      newListings: recentListings?.length || 0,
      newOrders: recentOrders?.length || 0,
      period: '7 days'
    }

    return NextResponse.json({ success: true, growth })
  } catch (error) {
    console.error('Stats growth error:', error)
    return NextResponse.json({ success: false, growth: null })
  }
}
