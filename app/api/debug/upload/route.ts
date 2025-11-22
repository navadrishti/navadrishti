import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Check environment variables
    const cloudinaryConfig = {
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME ? 'configured' : 'missing',
      api_key: process.env.CLOUDINARY_API_KEY ? 'configured' : 'missing',
      api_secret: process.env.CLOUDINARY_API_SECRET ? 'configured' : 'missing'
    };

    // Check if all required config is present
    const isConfigured = process.env.CLOUDINARY_CLOUD_NAME && 
                        process.env.CLOUDINARY_API_KEY && 
                        process.env.CLOUDINARY_API_SECRET;

    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      cloudinary: {
        configured: isConfigured,
        config: cloudinaryConfig,
        cloud_name_value: process.env.CLOUDINARY_CLOUD_NAME || 'not_set'
      },
      env: process.env.NODE_ENV,
      upload_endpoint: '/api/upload',
      supported_types: {
        images: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        documents: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
      },
      max_file_size: '10MB'
    });

  } catch (error) {
    console.error('Debug endpoint error:', error);
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Test upload functionality without actual file upload
    const body = await request.json().catch(() => ({}));
    
    return NextResponse.json({
      status: 'test_endpoint',
      message: 'This is a test endpoint to debug upload issues',
      received_data: body,
      headers: {
        authorization: request.headers.get('authorization') ? 'present' : 'missing',
        'content-type': request.headers.get('content-type')
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Debug POST error:', error);
    return NextResponse.json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}