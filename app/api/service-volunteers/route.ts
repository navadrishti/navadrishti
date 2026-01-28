import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const volunteerId = searchParams.get('volunteerId')

    if (!volunteerId) {
      return NextResponse.json(
        { error: 'volunteerId parameter is required' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('service_volunteers')
      .select(`
        *,
        service_requests!inner(
          title,
          description,
          ngo_id,
          users!service_requests_ngo_id_fkey(
            name,
            profile_image
          )
        )
      `)
      .eq('volunteer_id', volunteerId)
      .order('applied_at', { ascending: false })

    if (error) throw error

    // Flatten the nested structure
    const volunteers = data?.map(v => ({
      ...v,
      request_title: v.service_requests.title,
      request_description: v.service_requests.description,
      ngo_id: v.service_requests.ngo_id,
      ngo_name: v.service_requests.users.name,
      ngo_image: v.service_requests.users.profile_image
    })) || []

    return NextResponse.json({
      success: true,
      volunteers,
      data: volunteers
    })
  } catch (error: any) {
    console.error('Error fetching service volunteers:', error)
    return NextResponse.json(
      { error: 'Failed to fetch service volunteers', details: error.message },
      { status: 500 }
    )
  }
}
