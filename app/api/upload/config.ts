import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Increase the maximum request body size for file uploads
export const maxDuration = 30 // 30 seconds
export const bodyParser = {
  sizeLimit: '10mb',
}

// Export a config object to set API route configuration
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
}