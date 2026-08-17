import { NextRequest, NextResponse } from 'next/server'
import {
  getPwaUpstreamUrl,
  isAllowedPwaOrigin,
  PWA_API_PREFIX,
} from '@/lib/access-control'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = {
  params: Promise<{ path?: string[] }>
}

function corsHeaders(request: NextRequest): HeadersInit {
  const origin = request.headers.get('origin')
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers':
      request.headers.get('access-control-request-headers') ||
      'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
  }

  if (origin && isAllowedPwaOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }

  return headers
}

function withCors(request: NextRequest, response: NextResponse) {
  const headers = corsHeaders(request)
  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value)
  })
  return response
}

async function proxyToPwa(request: NextRequest, pathSegments: string[]) {
  const upstream = getPwaUpstreamUrl()
  if (!upstream) {
    return withCors(
      request,
      NextResponse.json(
        {
          error:
            'Field PWA upstream is not configured. Set PWA_UPSTREAM_URL (or NEXT_PUBLIC_PWA_URL) on the platform.',
          gateway: PWA_API_PREFIX,
        },
        { status: 503 }
      )
    )
  }

  const suffix = pathSegments.map(encodeURIComponent).join('/')
  const target = new URL(`${upstream}/api/${suffix}`)
  target.search = request.nextUrl.search

  const headers = new Headers(request.headers)
  headers.delete('host')
  headers.delete('connection')
  headers.delete('content-length')

  const method = request.method.toUpperCase()
  const body =
    method === 'GET' || method === 'HEAD' || method === 'OPTIONS'
      ? undefined
      : await request.arrayBuffer()

  const upstreamResponse = await fetch(target, {
    method,
    headers,
    body,
    redirect: 'manual',
  })

  const responseHeaders = new Headers(upstreamResponse.headers)
  // Let the browser talk to this gateway origin; strip upstream CORS.
  responseHeaders.delete('access-control-allow-origin')
  responseHeaders.delete('access-control-allow-credentials')
  responseHeaders.delete('access-control-allow-headers')
  responseHeaders.delete('access-control-allow-methods')

  const response = new NextResponse(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  })

  return withCors(request, response)
}

export async function OPTIONS(request: NextRequest) {
  return withCors(request, new NextResponse(null, { status: 204 }))
}

async function handle(request: NextRequest, context: RouteContext) {
  const { path = [] } = await context.params
  if (!path.length) {
    return withCors(
      request,
      NextResponse.json({
        ok: true,
        service: 'gram-field-pwa-gateway',
        prefix: PWA_API_PREFIX,
        message:
          'Proxy field-app APIs through the GRAM platform. Configure PWA_UPSTREAM_URL to the separately hosted PWA.',
      })
    )
  }

  try {
    return await proxyToPwa(request, path)
  } catch (error) {
    return withCors(
      request,
      NextResponse.json(
        {
          error: error instanceof Error ? error.message : 'PWA gateway proxy failed',
        },
        { status: 502 }
      )
    )
  }
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const PATCH = handle
export const DELETE = handle
