'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth-context';
import { Upload, X, MapPin, Hash, Image as ImageIcon, Loader2 } from 'lucide-react';
import { VerificationBadge } from './verification-badge';
import Image from 'next/image';
interface PostCreatorProps {
  onPostCreated?: () => void;
  className?: string;
}

interface UploadedImage {
  url: string;
  public_id: string;
  width: number;
  height: number;
}

export function PostCreator({ onPostCreated, className }: PostCreatorProps) {
  const { user, token } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Generate initials for avatar fallback
  const getInitials = (name: string) => {
    if (!name) return "U"
    const names = name.split(' ')
    if (names.length === 1) return names[0].charAt(0).toUpperCase()
    return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase()
  }
  
  const [content, setContent] = useState('');
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [location, setLocation] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);

  // Extract hashtags from content
  const extractHashtags = useCallback((text: string) => {
    const hashtagRegex = /#(\w+)/g;
    const matches = text.match(hashtagRegex);
    return matches ? matches.map(tag => tag.substring(1)) : [];
  }, []);

  // Handle content change and extract hashtags
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    
    const extractedHashtags = extractHashtags(newContent);
    setHashtags(extractedHashtags);
  };

  // Handle file upload
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    if (!user || !token) {
      toast({
        title: "Authentication Required",
        description: "Please log in to upload images.",
        variant: "destructive"
      });
      return;
    }

    setIsUploading(true);

    try {
      const uploadPromises = Array.from(files).map(async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder', 'social-posts');

        const response = await fetch('/api/upload', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Upload failed');
        }

        const result = await response.json();
        return result.data;
      });

      const uploadedImages = await Promise.all(uploadPromises);
      setImages(prev => [...prev, ...uploadedImages]);
      
      toast({
        title: "Images Uploaded",
        description: `${uploadedImages.length} image(s) uploaded successfully.`
      });
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "Failed to upload images.",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Remove image
  const removeImage = async (index: number) => {
    const imageToRemove = images[index];
    
    try {
      // Delete from Cloudinary
      await fetch(`/api/upload?publicId=${imageToRemove.public_id}`, {
        method: 'DELETE'
      });
      
      // Remove from state
      setImages(prev => prev.filter((_, i) => i !== index));
    } catch (error) {
      console.error('Error removing image:', error);
      toast({
        title: "Error",
        description: "Failed to remove image.",
        variant: "destructive"
      });
    }
  };

  // Get current location
  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({
        title: "Location Not Supported",
        description: "Geolocation is not supported by this browser.",
        variant: "destructive"
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          
          // Use reverse geocoding to get location name
          const response = await fetch(
            `https://api.opencagedata.com/geocode/v1/json?q=${latitude}+${longitude}&key=${process.env.NEXT_PUBLIC_OPENCAGE_API_KEY}`
          );
          
          if (response.ok) {
            const data = await response.json();
            const locationName = data.results[0]?.formatted || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
            setLocation(locationName);
          } else {
            setLocation(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
          }
        } catch (error) {
          console.error('Error getting location name:', error);
          setLocation(`${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`);
        }
      },
      (error) => {
        console.error('Error getting location:', error);
        toast({
          title: "Location Error",
          description: "Failed to get your location.",
          variant: "destructive"
        });
      }
    );
  };

  // Remove hashtag
  const removeHashtag = (tagToRemove: string) => {
    setHashtags(prev => prev.filter(tag => tag !== tagToRemove));
    // Also remove from content if it exists
    setContent(prev => prev.replace(new RegExp(`#${tagToRemove}\\b`, 'g'), ''));
  };

  // Create post
  const handleCreatePost = async () => {
    if (!user || !token) {
      toast({
        title: "Authentication Required",
        description: "Please log in to create a post.",
        variant: "destructive"
      });
      return;
    }

    if (!content.trim() && images.length === 0) {
      toast({
        title: "Content Required",
        description: "Please add some content or images to your post.",
        variant: "destructive"
      });
      return;
    }

    setIsPosting(true);

    try {
      const postData = {
        content: content.trim(),
        images: images.map(img => ({
          url: img.url,
          width: img.width,
          height: img.height
        })),
        location: location || null,
        hashtags
      };

      const response = await fetch('/api/posts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(postData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create post');
      }

      const result = await response.json();
      
      // Reset form
      setContent('');
      setImages([]);
      setLocation('');
      setHashtags([]);

      toast({
        title: "Post Created",
        description: "Your post has been shared successfully!"
      });

      onPostCreated?.();
    } catch (error) {
      console.error('Error creating post:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create post.",
        variant: "destructive"
      });
    } finally {
      setIsPosting(false);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center space-x-3">
          <Avatar className="w-10 h-10">
            {(() => {
              const img = user.profile_image;
              const isRealImage = img && 
                typeof img === 'string' && 
                img.length > 10 && 
                img.startsWith('https://') && 
                (img.includes('cloudinary') || img.includes('amazonaws') || img.includes('googleapis') || img.includes('imgur')) &&
                !img.includes('placeholder') && 
                !img.includes('default') &&
                !img.includes('avatar') &&
                !img.includes('profile-placeholder');
              
              return isRealImage ? (
                <AvatarImage 
                  src={img} 
                  alt={user.name || 'User'} 
                  onError={(e) => e.currentTarget.style.display = 'none'}
                />
              ) : null;
            })()}
            <AvatarFallback className="bg-gradient-to-br from-blue-400 to-indigo-500 text-white font-semibold">
              {getInitials(user.name || user.email || 'U')}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm">{user.name || 'User'}</h3>
              {user.verification_status === 'verified' && (
                <VerificationBadge status="verified" size="sm" showText={false} />
              )}
            </div>
            <p className="text-xs text-muted-foreground">Share something with the community</p>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Content Textarea */}
        <Textarea
          placeholder="What's on your mind? Use #hashtags to categorize your post..."
          value={content}
          onChange={handleContentChange}
          className="min-h-[120px] resize-none border-2 border-orange-200 focus:border-orange-400 focus-visible:ring-2 focus-visible:ring-orange-200 text-base rounded-xl transition-colors"
          maxLength={2000}
        />

        {/* Image Preview Grid */}
        {images.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {images.map((image, index) => (
              <div key={index} className="relative group">
                <Image
                  src={image.url}
                  alt={`Upload ${index + 1}`}
                  width={200}
                  height={200}
                  className="w-full h-32 object-cover rounded-lg"
                />
                <Button
                  size="icon"
                  variant="destructive"
                  className="absolute top-1 right-1 w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => removeImage(index)}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
        


        {/* Hashtags */}
        {hashtags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {hashtags.map((tag, index) => (
              <Badge 
                key={index} 
                variant="secondary" 
                className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                onClick={() => removeHashtag(tag)}
              >
                #{tag} <X className="w-3 h-3 ml-1" />
              </Badge>
            ))}
          </div>
        )}



        {/* Location */}
        {location && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="w-4 h-4" />
            <span>{location}</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setLocation('')}
              className="h-6 w-6 p-0"
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={(e) => handleFileUpload(e.target.files)}
              className="hidden"
            />
            
            <Button
              size="sm"
              variant="ghost"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="text-blue-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            >
              {isUploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ImageIcon className="w-4 h-4" />
              )}
              Photos
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={getCurrentLocation}
              className="text-green-500 hover:text-green-600 hover:bg-green-50 transition-colors"
            >
              <MapPin className="w-4 h-4" />
              Location
            </Button>
          </div>

          <Button
            onClick={handleCreatePost}
            disabled={isPosting || (!content.trim() && images.length === 0)}
            className="px-6 bg-orange-500 hover:bg-orange-600 text-white"
          >
            {isPosting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Posting...
              </>
            ) : (
              'Post'
            )}
          </Button>
        </div>

        {/* Character count */}
        <div className="text-xs text-muted-foreground text-right">
          {content.length}/2000 characters
        </div>
      </CardContent>
    </Card>
  );
}