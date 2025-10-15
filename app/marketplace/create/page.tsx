'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Upload, Plus } from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { FileUpload } from '@/components/ui/file-upload'
import ProtectedRoute from '@/components/protected-route'

const categories = [
  'Clothing & Textiles',
  'Food & Nutrition', 
  'Medical & Healthcare',
  'Education & Books',
  'Office & Supplies',
  'Household Items',
  'Furniture & Home',
  'Baby & Children',
  'Personal Care',
  'Transportation',
  'Emergency Supplies',
  'Tools & Equipment',
  'Other'
];

export default function CreateListingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: '',
    price: '',
    quantity: 1,
    location: '',
    tags: '',
    condition_type: 'new'
  });
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const convertImageToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      setError('You must be logged in to create a listing');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      
      // Convert images to base64 for now (in production, you'd upload to cloud storage)
      let imageUrls: string[] = [];
      if (images.length > 0) {
        try {
          const base64Images = await Promise.all(
            images.map(image => convertImageToBase64(image))
          );
          imageUrls = base64Images;
        } catch (imageError) {
          console.error('Error converting images:', imageError);
          setError('Error processing images. Please try again.');
          setLoading(false);
          return;
        }
      }
      
      const response = await fetch('/api/marketplace', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'create',
          ...formData,
          price: parseFloat(formData.price),
          quantity: parseInt(formData.quantity.toString()),
          tags: formData.tags.split(',').map(tag => tag.trim()).filter(tag => tag),
          images: imageUrls
        })
      });

      const data = await response.json();

      if (data.success) {
        // Clean up image previews
        imagePreviews.forEach(preview => URL.revokeObjectURL(preview));
        router.push('/marketplace');
      } else {
        setError(data.message || 'Failed to create listing');
      }
    } catch (err) {
      setError('Error creating listing');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Limit to 5 images
    const newImages = [...images, ...files].slice(0, 5);
    setImages(newImages);

    // Create previews
    const previews = newImages.map(file => URL.createObjectURL(file));
    // Clean up old previews
    imagePreviews.forEach(preview => URL.revokeObjectURL(preview));
    setImagePreviews(previews);
  };

  const removeImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    const newPreviews = imagePreviews.filter((_, i) => i !== index);
    
    // Clean up removed preview
    URL.revokeObjectURL(imagePreviews[index]);
    
    setImages(newImages);
    setImagePreviews(newPreviews);
  };

  return (
    <ProtectedRoute>
      <div className="flex min-h-screen flex-col">
        <Header />
        
        <main className="flex-1 px-6 py-8 md:px-10">
        <div className="mb-8">
          <Link href="/marketplace" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4">
            <ArrowLeft size={16} />
            Back to Marketplace
          </Link>
          
          <h1 className="text-3xl font-bold tracking-tight">List an Item</h1>
          <p className="text-muted-foreground">
            Share items with the community
          </p>
        </div>

        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Item Details</CardTitle>
              <CardDescription>
                Provide information about the item you want to list
              </CardDescription>
            </CardHeader>
            <CardContent>
              {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              )}
              
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid gap-4">
                  <div>
                    <Label htmlFor="title">Title *</Label>
                    <Input
                      id="title"
                      name="title"
                      value={formData.title}
                      onChange={handleChange}
                      placeholder="Enter item title"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="description">Description *</Label>
                    <Textarea
                      id="description"
                      name="description"
                      value={formData.description}
                      onChange={handleChange}
                      placeholder="Describe the item, its condition, and any important details"
                      rows={4}
                      required
                    />
                  </div>

                  {/* Image Upload Section */}
                  <div>
                    <Label htmlFor="images">Product Images</Label>
                    <FileUpload
                      title="Upload product images"
                      description="High-quality photos that showcase your product from different angles"
                      multiple={true}
                      maxFiles={5}
                      maxSize={5}
                      recommendedSize="2MB per image"
                      files={images}
                      onFilesChange={setImages}
                      allowedTypes={['image/jpeg', 'image/jpg', 'image/png', 'image/webp']}
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label htmlFor="category">Category *</Label>
                      <select
                        id="category"
                        name="category"
                        value={formData.category}
                        onChange={handleChange}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        required
                      >
                        <option value="">Select a category</option>
                        {categories.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <Label htmlFor="price">Price (₹) *</Label>
                      <Input
                        id="price"
                        name="price"
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.price}
                        onChange={handleChange}
                        placeholder="0.00"
                        required
                      />
                    </div>
                  </div>

                  {/* Selling Type Section */}
                  {/* Stock & Condition Section */}
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label htmlFor="condition_type">Item Condition *</Label>
                      <select
                        id="condition_type"
                        name="condition_type"
                        value={formData.condition_type}
                        onChange={handleChange}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        required
                      >
                        <option value="new">New</option>
                        <option value="like_new">Like New</option>
                        <option value="good">Good</option>
                        <option value="fair">Fair</option>
                        <option value="poor">Poor</option>
                      </select>
                    </div>

                    <div>
                      <Label htmlFor="quantity">Available Quantity</Label>
                      <Input
                        id="quantity"
                        name="quantity"
                        type="number"
                        min="1"
                        value={formData.quantity}
                        onChange={handleChange}
                        placeholder="Number of items available"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Total items you have available
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">

                    <div>
                      <Label htmlFor="location">Location</Label>
                      <Input
                        id="location"
                        name="location"
                        value={formData.location}
                        onChange={handleChange}
                        placeholder="City, State"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="tags">Tags</Label>
                    <Input
                      id="tags"
                      name="tags"
                      value={formData.tags}
                      onChange={handleChange}
                      placeholder="clothing, furniture, books, electronics"
                    />
                    <p className="text-sm text-muted-foreground mt-1">
                      Separate tags with commas
                    </p>
                  </div>
                </div>

                <div className="flex gap-4 pt-6">
                  <Button type="submit" disabled={loading} className="flex-1">
                    {loading ? 'Creating...' : 'Create Listing'}
                  </Button>
                  <Button type="button" variant="outline" asChild>
                    <Link href="/marketplace">Cancel</Link>
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
    </ProtectedRoute>
  );
}