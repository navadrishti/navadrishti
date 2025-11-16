import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Only allow debug endpoint in development environment
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DEBUG_ENDPOINTS !== 'true') {
    return NextResponse.json(
      { error: 'Debug endpoint not available in production' },
      { status: 404 }
    );
  }

  try {
    const authHeader = request.headers.get('Authorization');
    const cookieToken = request.cookies.get('token')?.value;
    
    // Only log in development
    if (process.env.NODE_ENV === 'development') {
      console.log('Debug - Auth header:', authHeader);
      console.log('Debug - Cookie token:', cookieToken);
    }
    
    const token = authHeader?.replace('Bearer ', '') || cookieToken;
    
    const debugInfo = {
      authHeader: authHeader || 'Not present',
      cookieToken: cookieToken || 'Not present',
      finalToken: token || 'Not found',
      tokenLength: token ? token.length : 0,
      tokenParts: token ? token.split('.').length : 0,
      hasQuotes: token ? (token.includes('"') || token.includes("'")) : false,
      hasWhitespace: token ? /\s/.test(token) : false,
      startsWithBearer: token ? token.startsWith('Bearer ') : false,
      firstChars: token ? token.substring(0, 20) : 'N/A',
      lastChars: token ? token.substring(token.length - 20) : 'N/A'
    };
    
    return NextResponse.json(debugInfo, { status: 200 });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Debug endpoint error:', error);
    }
    return NextResponse.json(
      { 
        error: 'Debug endpoint failed', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}