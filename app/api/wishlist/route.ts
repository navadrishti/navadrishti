import { NextRequest } from 'next/server'
import { supabase } from '@/lib/db'
import { verifyToken } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return Response.json({ error: 'Authentication required' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    const payload = verifyToken(token)
    if (!payload) {
      return Response.json({ error: 'Invalid token' }, { status: 401 })
    }

    const { marketplace_item_id } = await request.json()

    if (!marketplace_item_id) {
      return Response.json({ error: 'Marketplace item ID is required' }, { status: 400 })
    }

    // Check if item already in wishlist
    const { data: existing } = await supabase
      .from('wishlist')
      .select('id')
      .eq('user_id', payload.id)
      .eq('marketplace_item_id', marketplace_item_id)
      .single()

    if (existing) {
      return Response.json({ error: 'Item already in wishlist' }, { status: 400 })
    }

    // Add to wishlist
    const { error } = await supabase
      .from('wishlist')
      .insert({
        user_id: payload.id,
        marketplace_item_id: marketplace_item_id
      })

    if (error) {
      console.error('Wishlist insert error:', error)
      return Response.json({ error: 'Failed to add to wishlist' }, { status: 500 })
    }

    return Response.json({ 
      success: true, 
      message: 'Added to wishlist successfully' 
    })

  } catch (error) {
    console.error('Wishlist API error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Verify authentication
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return Response.json({ error: 'Authentication required' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    const payload = verifyToken(token)
    if (!payload) {
      return Response.json({ error: 'Invalid token' }, { status: 401 })
    }

    const { marketplace_item_id } = await request.json()

    if (!marketplace_item_id) {
      return Response.json({ error: 'Marketplace item ID is required' }, { status: 400 })
    }

    // Remove from wishlist
    const { error } = await supabase
      .from('wishlist')
      .delete()
      .eq('user_id', payload.id)
      .eq('marketplace_item_id', marketplace_item_id)

    if (error) {
      console.error('Wishlist delete error:', error)
      return Response.json({ error: 'Failed to remove from wishlist' }, { status: 500 })
    }

    return Response.json({ 
      success: true, 
      message: 'Removed from wishlist successfully' 
    })

  } catch (error) {
    console.error('Wishlist API error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return Response.json({ error: 'Authentication required' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    const payload = verifyToken(token)
    if (!payload) {
      return Response.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Get user's wishlist
    const { data: wishlistItems, error } = await supabase
      .from('wishlist')
      .select(`
        id,
        marketplace_item_id,
        created_at,
        marketplace_items (
          id,
          title,
          price,
          images,
          condition_type,
          quantity,
          status
        )
      `)
      .eq('user_id', payload.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Wishlist fetch error:', error)
      return Response.json({ error: 'Failed to fetch wishlist' }, { status: 500 })
    }

    return Response.json({ 
      success: true, 
      wishlist: wishlistItems || [] 
    })

  } catch (error) {
    console.error('Wishlist API error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}