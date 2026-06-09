import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { getAuthUserFromRequest } from '@/lib/server-auth'

type ScoreRequest = {
  campaignName?: string
  category?: string
  city?: string
  state?: string
  volunteers_needed?: number
  limit?: number
}

function tokenize(s: string | undefined) {
  if (!s) return [] as string[]
  return String(s).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
}

export async function POST(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request)
    // only authenticated users can request scoring (helps rate-limit)
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const body = (await request.json()) as ScoreRequest
    const limit = Number(body.limit || 10)
    const reqTokens = [...tokenize(body.campaignName), ...tokenize(body.category)]

    const { data: ngos, error } = await supabase
      .from('users')
      .select('id, name, email, city, state_province, profile_data, ngo_volunteer_capacity, verification_status')
      .eq('user_type', 'ngo')
      .limit(200)

    if (error) {
      console.error('Failed to fetch NGOs for scoring:', error)
      return NextResponse.json({ error: 'Failed to fetch ngos' }, { status: 500 })
    }

    const scored = (ngos || []).map((ngo: any) => {
      let score = 0
      const profile = ngo.profile_data && typeof ngo.profile_data === 'object' ? ngo.profile_data : {}

      // category/area match (high weight)
      const focus = String(profile.focus_areas || '')
      const focusTokens = tokenize(focus)
      const overlap = reqTokens.filter((t) => focusTokens.includes(t)).length
      score += overlap * 30

      // additional expertise/past projects overlap
      const past = String(profile.past_projects || '')
      const pastTokens = tokenize(past)
      const pastOverlap = reqTokens.filter((t) => pastTokens.includes(t)).length
      score += pastOverlap * 10

      // location boosts (important but secondary)
      if (body.city && ngo.city && String(body.city).toLowerCase() === String(ngo.city).toLowerCase()) score += 25
      if (body.state && ngo.state_province && String(body.state).toLowerCase() === String(ngo.state_province).toLowerCase()) score += 10

      // verification
      if (ngo.verification_status === 'verified') score += 8

      // capacity should NOT disqualify or overweight lead selection.
      // Return capacity for gap calculation but only use a very small tie-breaker contribution.
      const capacity = Number(ngo.ngo_volunteer_capacity || 0)
      const required = Number(body.volunteers_needed || 0)
      if (required > 0 && capacity > 0) {
        const capScore = Math.min(1, capacity / Math.max(1, required)) * 2 // tiny tie-breaker (max 2 points)
        score += capScore
      }

      return {
        id: ngo.id,
        name: ngo.name,
        email: ngo.email,
        city: ngo.city,
        state_province: ngo.state_province,
        profile: profile,
        ngo_volunteer_capacity: capacity,
        score: Math.round(score * 10) / 10,
      }
    })

    scored.sort((a, b) => b.score - a.score)

    return NextResponse.json({ success: true, data: scored.slice(0, limit) })
  } catch (e) {
    console.error('NGO scoring error:', e)
    return NextResponse.json({ error: 'Failed to score ngos' }, { status: 500 })
  }
}
