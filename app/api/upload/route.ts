import { NextRequest, NextResponse } from 'next/server';
import { v2 as cloudinary, type UploadApiOptions, type UploadApiResponse } from 'cloudinary';
import { findAuthUser } from '@/lib/server-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const ALLOWED_FOLDERS = new Set(['images', 'documents']);
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const ALLOWED_DOCUMENT_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function toPathSegment(value: FormDataEntryValue | null, fallback: string) {
  const cleaned = typeof value === 'string' ? value.trim().replace(/[^A-Za-z0-9_-]/g, '') : '';
  return cleaned || fallback;
}

// Legacy uploads were stored flat as `<folder>/<key>_<userId>_<timestamp>`.
function publicIdBelongsTo(publicId: string, userId: string) {
  const segments = publicId.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) return false;
  if (segments.length === 3 && ALLOWED_FOLDERS.has(segments[0]) && segments[1] === userId) return true;
  if (segments.length === 2 && ALLOWED_FOLDERS.has(segments[0])) {
    return segments[1].match(/_(\d+)_\d+$/)?.[1] === userId;
  }
  return false;
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      const missingVars = [];
      if (!process.env.CLOUDINARY_CLOUD_NAME) missingVars.push('CLOUDINARY_CLOUD_NAME');
      if (!process.env.CLOUDINARY_API_KEY) missingVars.push('CLOUDINARY_API_KEY');
      if (!process.env.CLOUDINARY_API_SECRET) missingVars.push('CLOUDINARY_API_SECRET');
      
      console.error('Missing Cloudinary environment variables:', missingVars);
      return NextResponse.json(
        { error: 'File upload service is not configured. Please contact support.' },
        { status: 503 }
      );
    }

    const authUser = findAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const userId = String(authUser.id);

    const formData = await request.formData();
    const file = formData.get('file');
    const folderField = formData.get('folder');
    
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const requestedFolder =
      typeof folderField === 'string' && folderField.trim() ? folderField.trim() : '';
    if (requestedFolder && !ALLOWED_FOLDERS.has(requestedFolder)) {
      return NextResponse.json({ error: 'Invalid upload folder' }, { status: 400 });
    }
    const documentKey = toPathSegment(formData.get('documentKey'), 'file');

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum size is 10MB.' }, { status: 413 });
    }

    const isImage = ALLOWED_IMAGE_TYPES.has(file.type);
    const isDocument = ALLOWED_DOCUMENT_TYPES.has(file.type);
    
    if (!isImage && !isDocument) {
      return NextResponse.json({ 
        error: 'Only image files (JPG, PNG, GIF, WebP) and documents (PDF, DOC, DOCX) are allowed' 
      }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const resourceType = isDocument ? 'raw' : 'image';
    const uploadFolder = requestedFolder || (isDocument ? 'documents' : 'images');
    const uploadOptions: UploadApiOptions = {
      resource_type: resourceType,
      folder: `${uploadFolder}/${userId}`,
      public_id: `${documentKey}_${Date.now()}`,
      overwrite: false,
    };
    
    if (isImage) {
      uploadOptions.transformation = [
        { width: 800, height: 600, crop: 'limit' },
        { quality: 'auto' },
        { format: 'auto' }
      ];
    }

    // Upload to Cloudinary
    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, uploadResult) => {
          if (error || !uploadResult) reject(error ?? new Error('Cloudinary upload returned no result'));
          else resolve(uploadResult);
        }
      ).end(buffer);
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
        error: errorMessage
      },
      { status: statusCode }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authUser = findAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const publicId = searchParams.get('publicId')?.trim();

    if (!publicId) {
      return NextResponse.json({ error: 'Public ID is required' }, { status: 400 });
    }

    if (!publicIdBelongsTo(publicId, String(authUser.id))) {
      return NextResponse.json({ error: 'You can only delete your own uploads' }, { status: 403 });
    }

    await cloudinary.uploader.destroy(publicId);

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error) {
    console.error('Error deleting image:', error);
    return NextResponse.json({ error: 'Failed to delete image' }, { status: 500 });
  }
}