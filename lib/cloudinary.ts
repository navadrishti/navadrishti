import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  console.log('✅ Cloudinary configured successfully');
} else {
  console.warn('⚠️ Cloudinary configuration missing. Image uploads will not work.');
}

export { cloudinary };

// Helper function to upload image to Cloudinary
export async function uploadToCloudinary(
  file: Buffer | string,
  options: {
    folder?: string;
    public_id?: string;
    transformation?: any;
    format?: string;
    quality?: string | number;
  } = {}
): Promise<{ secure_url: string; public_id: string; [key: string]: any }> {
  try {
    const uploadOptions = {
      folder: options.folder || 'Navadrishti',
      quality: options.quality || 'auto:good',
      format: options.format || 'webp', // Convert to WebP for optimization
      ...options
    };

    const result = await cloudinary.uploader.upload(file as string, uploadOptions);
    
    console.log('✅ Image uploaded to Cloudinary:', result.public_id);
    return result;
  } catch (error) {
    console.error('❌ Cloudinary upload failed:', error);
    throw new Error('Failed to upload image');
  }
}

// Helper function to delete image from Cloudinary
export async function deleteFromCloudinary(publicId: string): Promise<void> {
  try {
    await cloudinary.uploader.destroy(publicId);
    console.log('✅ Image deleted from Cloudinary:', publicId);
  } catch (error) {
    console.error('❌ Failed to delete from Cloudinary:', error);
    throw new Error('Failed to delete image');
  }
}

// Helper function to generate upload signature for client-side uploads
export function generateUploadSignature(params: Record<string, any>): string {
  if (!process.env.CLOUDINARY_API_SECRET) {
    throw new Error('Cloudinary API secret not configured');
  }
  
  return cloudinary.utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET);
}

// Helper function to validate Cloudinary configuration
export function validateCloudinaryConfig(): boolean {
  return !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}