import { v2 as cloudinary, type UploadApiOptions, type UploadApiResponse } from 'cloudinary';

if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

export { cloudinary };

export async function uploadToCloudinary(
  file: Buffer | string,
  options: {
    folder?: string;
    public_id?: string;
    transformation?: UploadApiOptions['transformation'];
    format?: string;
    quality?: string | number;
  } = {}
): Promise<UploadApiResponse> {
  try {
    const uploadOptions = {
      folder: options.folder || 'Navadrishti',
      quality: options.quality || 'auto:good',
      format: options.format || 'webp', // Convert to WebP for optimization
      ...options
    };

    const result = await cloudinary.uploader.upload(file as string, uploadOptions);
    
    return result;
  } catch (error) {
    console.error('Cloudinary upload failed:', error);
    throw new Error('Failed to upload image');
  }
}
