import { NextResponse } from "next/server"
import { supabase } from "@/lib/db"
import { verifyToken } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    // Get user from auth token
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const user = verifyToken(token)
    
    if (!user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const userId = user.id

    // Get user info
    const { data: userInfo } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()

    // Count posts
    const { data: posts, count: postsCount } = await supabase
      .from('posts')
      .select('*', { count: 'exact' })
      .eq('author_id', userId)

    // Count service requests
    const { count: requestsCount } = await supabase
      .from('service_requests')
      .select('*', { count: 'exact' })
      .or(`ngo_id.eq.${userId},company_id.eq.${userId}`)

    // Count service offers
    const { count: offersCount } = await supabase
      .from('service_offers')
      .select('*', { count: 'exact' })
      .eq('ngo_id', userId)

    // Count volunteer and client participation
    const { count: volunteerCount } = await supabase
      .from('service_volunteers')
      .select('*', { count: 'exact' })
      .eq('volunteer_id', userId)

    const { count: clientCount } = await supabase
      .from('service_clients')
      .select('*', { count: 'exact' })
      .eq('client_id', userId)

    const total = (postsCount || 0) + (requestsCount || 0) + (offersCount || 0) + (volunteerCount || 0) + (clientCount || 0)

    return NextResponse.json({
      userId: userId,
      userName: userInfo?.name,
      userEmail: userInfo?.email,
      contributions: {
        posts: postsCount,
        requests: requestsCount,
        offers: offersCount,
        volunteered: volunteerCount,
        clientProjects: clientCount,
        total
      },
      recentPosts: posts?.slice(0, 5).map((p: any) => ({
        id: p.id,
        content: p.content?.substring(0, 50),
        created_at: p.created_at
      }))
    })
  } catch (error) {
    console.error('Debug error:', error)
    return NextResponse.json({ error: 'Failed to fetch data', details: error }, { status: 500 })
  }
}
