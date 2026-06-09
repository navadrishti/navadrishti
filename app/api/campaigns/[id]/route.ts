import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { getAuthUserFromRequest, assertUserType } from '@/lib/server-auth'

async function loadCampaign(campaignId: string) {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .maybeSingle()

  if (error || !data) {
    throw new Error('Campaign not found')
  }

  return data
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = getAuthUserFromRequest(request)
    assertUserType(user, ['company'])

    const { id } = await params
    const campaign = await loadCampaign(id)

    if (Number(campaign.company_id || 0) !== Number(user.id)) {
      return NextResponse.json({ error: 'You can only delete your own campaign' }, { status: 403 })
    }

    const { error } = await supabase
      .from('campaigns')
      .delete()
      .eq('id', id)
      .eq('company_id', user.id)

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Campaign delete error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to delete campaign' }, { status: 500 })
  }
}