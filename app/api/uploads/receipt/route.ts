import { NextRequest, NextResponse } from 'next/server'
import { uploadToCloudinary } from '@/lib/cloudinary'
import { getTokenClaims } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const decoded = getTokenClaims(request)
    if (!decoded) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Receipt file is required' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const dataUrl = `data:${file.type};base64,${buffer.toString('base64')}`

    const uploaded = await uploadToCloudinary(dataUrl, {
      folder: `Navadrishti/receipts/${decoded.user_type}`,
      format: 'png'
    })

    return NextResponse.json({
      success: true,
      data: {
        url: uploaded.secure_url,
        publicId: uploaded.public_id
      }
    })
  } catch (error) {
    console.error('Error uploading receipt:', error)
    return NextResponse.json({ error: 'Failed to upload receipt' }, { status: 500 })
  }
}