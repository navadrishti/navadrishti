import { NextRequest, NextResponse } from 'next/server'
import { caErrorResponse, listCAHistory, requireCA } from '@/lib/ca-review'

export async function GET(request: NextRequest) {
  try {
    const ca = await requireCA(request)
    const data = await listCAHistory(ca)
    return NextResponse.json({
      success: true,
      data,
      count: data.length,
    })
  } catch (error) {
    const handled = caErrorResponse(error)
    if (handled) return handled
    console.error('CA history API error:', error)
    return NextResponse.json({ error: 'Failed to fetch review history' }, { status: 500 })
  }
}
