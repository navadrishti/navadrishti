import { NextRequest, NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';
import { verifyToken } from '@/lib/auth';

// Configure route settings
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30; // 30 seconds timeout

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(request: NextRequest) {
  try {
    // Validate Cloudinary configuration
    console.log('Cloudinary Config Check:', {
      cloud_name: !!process.env.CLOUDINARY_CLOUD_NAME,
      api_key: !!process.env.CLOUDINARY_API_KEY,
      api_secret: !!process.env.CLOUDINARY_API_SECRET
    });
    
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      console.error('Missing Cloudinary environment variables', {
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME ? 'present' : 'missing',
        api_key: process.env.CLOUDINARY_API_KEY ? 'present' : 'missing',
        api_secret: process.env.CLOUDINARY_API_SECRET ? 'present' : 'missing'
      });
      return NextResponse.json(
        { error: 'Server configuration error - missing Cloudinary credentials' },
        { status: 500 }
      );
    }

    // Check authentication using JWT token
    const authHeader = request.headers.get('authorization');
    let token;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    const user = verifyToken(token);
    if (!user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
    
    const userId = user.id;

    // Get the uploaded file
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Check file size (max 10MB - increased from 5MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Maximum size is 10MB.' }, { status: 413 });
    }

    // Check file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image files are allowed' }, { status: 400 });
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Upload to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          resource_type: 'image',
          folder: 'marketplace', // Organize uploads in folders
          public_id: `${userId}_${Date.now()}`, // Unique filename
          transformation: [
            { width: 800, height: 600, crop: 'limit' }, // Resize to reasonable size
            { quality: 'auto' }, // Auto optimize quality
            { format: 'auto' } // Auto choose best format
          ]
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(buffer);
    });

    const result = uploadResult as any;

    return NextResponse.json({
      success: true,
      data: {
        url: result.secure_url,
        public_id: result.public_id,
        width: result.width,
        height: result.height
      }
    });

  } catch (error) {
    console.error('Upload error:', error);
    
    // Provide more detailed error messages
    let errorMessage = 'Failed to upload image';
    let statusCode = 500;
    
    if (error instanceof Error) {
      if (error.message.includes('Invalid token')) {
        errorMessage = 'Authentication failed';
        statusCode = 401;
      } else if (error.message.includes('File too large')) {
        errorMessage = 'File size exceeds limit';
        statusCode = 413;
      } else if (error.message.includes('Cloudinary')) {
        errorMessage = 'Image processing failed';
        statusCode = 502;
      }
    }
    
    return NextResponse.json(
      { 
        success: false,
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? error instanceof Error ? error.message : 'Unknown error' : undefined
      },
      { status: statusCode }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Check authentication using JWT token
    const authHeader = request.headers.get('authorization');
    let token;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    
    const user = verifyToken(token);
    if (!user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const publicId = searchParams.get('publicId');

    if (!publicId) {
      return NextResponse.json({ error: 'Public ID is required' }, { status: 400 });
    }

    // Delete from Cloudinary
    await cloudinary.uploader.destroy(publicId);

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error) {
    console.error('Error deleting image:', error);
    return NextResponse.json({ error: 'Failed to delete image' }, { status: 500 });
  }
}