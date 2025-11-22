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
    const configStatus = {
      cloud_name: !!process.env.CLOUDINARY_CLOUD_NAME,
      api_key: !!process.env.CLOUDINARY_API_KEY,
      api_secret: !!process.env.CLOUDINARY_API_SECRET
    };
    
    console.log('Cloudinary Config Check:', configStatus);
    
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      const missingVars = [];
      if (!process.env.CLOUDINARY_CLOUD_NAME) missingVars.push('CLOUDINARY_CLOUD_NAME');
      if (!process.env.CLOUDINARY_API_KEY) missingVars.push('CLOUDINARY_API_KEY');
      if (!process.env.CLOUDINARY_API_SECRET) missingVars.push('CLOUDINARY_API_SECRET');
      
      console.error('Missing Cloudinary environment variables:', missingVars);
      return NextResponse.json(
        { 
          error: 'File upload service is not configured. Please contact support.',
          details: process.env.NODE_ENV === 'development' ? 
            `Missing environment variables: ${missingVars.join(', ')}. Please create a .env.local file with Cloudinary credentials.` : 
            'Upload service configuration error',
          missing_vars: process.env.NODE_ENV === 'development' ? missingVars : undefined
        },
        { status: 503 }
      );
    }

    // Check authentication using JWT token (optional during registration)
    const authHeader = request.headers.get('authorization');
    let userId = 'anonymous';
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const user = verifyToken(token);
      if (user) {
        userId = user.id;
      }
    }

    // Get the uploaded file
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      console.error('No file provided in upload request');
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Log file information for debugging
    console.log('Upload attempt:', {
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      userId: userId
    });

    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      console.error('File too large:', { size: file.size, maxSize: 10 * 1024 * 1024 });
      return NextResponse.json({ error: 'File too large. Maximum size is 10MB.' }, { status: 413 });
    }

    // Check file type - allow images and documents
    const isImage = file.type.startsWith('image/');
    const isDocument = file.type === 'application/pdf' || 
                      file.type === 'application/msword' || 
                      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    
    if (!isImage && !isDocument) {
      return NextResponse.json({ 
        error: 'Only image files (JPG, PNG, GIF, WebP) and documents (PDF, DOC, DOCX) are allowed' 
      }, { status: 400 });
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Determine resource type and upload options
    const resourceType = isDocument ? 'raw' : 'image';
    const uploadOptions: any = {
      resource_type: resourceType,
      folder: isDocument ? 'documents' : 'images',
      public_id: `${userId}_${Date.now()}`,
    };
    
    // Add transformations only for images
    if (isImage) {
      uploadOptions.transformation = [
        { width: 800, height: 600, crop: 'limit' },
        { quality: 'auto' },
        { format: 'auto' }
      ];
    }

    // Upload to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(buffer);
    });

    const result = uploadResult as any;

    console.log('Upload successful:', {
      fileName: file.name,
      url: result.secure_url,
      publicId: result.public_id,
      resourceType: resourceType
    });

    return NextResponse.json({
      success: true,
      data: {
        url: result.secure_url,
        public_id: result.public_id,
        width: result.width,
        height: result.height,
        resource_type: resourceType
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