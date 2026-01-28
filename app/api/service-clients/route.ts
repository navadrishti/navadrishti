import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('clientId')

    if (!clientId) {
      return NextResponse.json(
        { error: 'clientId parameter is required' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('service_clients')
      .select(`
        *,
        service_offers!inner(
          title,
          description,
          ngo_id,
          users!service_offers_ngo_id_fkey(
            name,
            profile_image
          )
        )
      `)
      .eq('client_id', clientId)
      .order('applied_at', { ascending: false })

    if (error) throw error

    // Flatten the nested structure
    const clients = data?.map(c => ({
      ...c,
      offer_title: c.service_offers.title,
      offer_description: c.service_offers.description,
      ngo_id: c.service_offers.ngo_id,
      ngo_name: c.service_offers.users.name,
      ngo_image: c.service_offers.users.profile_image
    })) || []

    return NextResponse.json({
      success: true,
      clients,
      data: clients
    })
  } catch (error: any) {
    console.error('Error fetching service clients:', error)
    return NextResponse.json(
      { error: 'Failed to fetch service clients', details: error.message },
      { status: 500 }
    )
  }
}
