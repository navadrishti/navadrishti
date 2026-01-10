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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Upload, Plus } from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import ProtectedRoute from '@/components/enhanced-protected-route'

const categories = [
  'Clothing & Apparel',
  'Books & Stationery',
  'Electronics & Devices',
  'Furniture',
  'Toys & Kids Items',
  'Medical Supplies',
  'Groceries & Essentials',
  'Home & Kitchen Items',
  'Sports Equipment',
  'Beauty & Personal Care',
  'Arts & Crafts',
  'Tools & Hardware',
  'Bicycles & Vehicles',
  'Pet Supplies',
  'Handmade NGO Products',
  'Upcycled Products',
  'Sustainable Goods',
  'Local Community Listings',
  'Free Giveaways',
  'Donation Items'
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
    location: '', // Keep for backward compatibility
    // Structured location fields
    city: '',
    state_province: '',
    pincode: '',
    country: 'India',
    tags: '',
    condition_type: 'new',
    brand: '',
    weight_kg: '',
    dimensions_length: '',
    dimensions_width: '',
    dimensions_height: '',
    specifications: {} as Record<string, string>
  });
  const [whoCanBuy, setWhoCanBuy] = useState<string[]>([]);
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [uploadedImageUrls, setUploadedImageUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [customSpecs, setCustomSpecs] = useState<Array<{key: string, value: string}>>([]);

  const addCustomSpec = () => {
    setCustomSpecs([...customSpecs, { key: '', value: '' }]);
  };

  const updateCustomSpec = (index: number, field: 'key' | 'value', value: string) => {
    const updated = [...customSpecs];
    updated[index][field] = value;
    setCustomSpecs(updated);
  };

  const removeCustomSpec = (index: number) => {
    setCustomSpecs(customSpecs.filter((_, i) => i !== index));
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
      
      // Use the uploaded image URLs
      const imageUrls = uploadedImageUrls;
      
      // Build specifications object
      const specifications = customSpecs.reduce((acc, spec) => {
        if (spec.key.trim() && spec.value.trim()) {
          acc[spec.key.trim()] = spec.value.trim();
        }
        return acc;
      }, {} as Record<string, string>);

      // Build dimensions object
      const dimensions = {
        length: formData.dimensions_length ? parseFloat(formData.dimensions_length) : null,
        width: formData.dimensions_width ? parseFloat(formData.dimensions_width) : null,
        height: formData.dimensions_height ? parseFloat(formData.dimensions_height) : null
      };
      
      // Validate who_can_buy is not empty
      if (whoCanBuy.length === 0) {
        setError('Please select at least one buyer type who can purchase this item');
        setLoading(false);
        return;
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
          weight_kg: formData.weight_kg ? parseFloat(formData.weight_kg) : null,
          dimensions_cm: Object.values(dimensions).some(v => v !== null) ? dimensions : null,
          specifications: Object.keys(specifications).length > 0 ? specifications : null,
          tags: formData.tags.split(',').map(tag => tag.trim()).filter(tag => tag),
          images: imageUrls,
          who_can_buy: whoCanBuy
        })
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));

      let data;
      try {
        const responseText = await response.text();
        console.log('Raw response:', responseText);
        
        if (!responseText.trim()) {
          console.error('Empty response received from server');
          setError(`Server returned empty response. Status: ${response.status}`);
          setLoading(false);
          return;
        }
        
        data = JSON.parse(responseText);
        console.log('Parsed response data:', data);
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        setError(`Server returned invalid response. Status: ${response.status}`);
        setLoading(false);
        return;
      }

      if (data.success) {
        // Clean up image previews
        imagePreviews.forEach(preview => URL.revokeObjectURL(preview));
        router.push('/marketplace');
      } else {
        const errorMsg = data.error || data.message || 'Failed to create listing';
        
        // Safely log the error - avoid logging empty objects
        if (data && Object.keys(data).length > 0) {
          console.error('API Error:', data);
        } else {
          console.error('API Error: Empty response received');
        }
        
        // Handle verification requirement specifically
        if (data.requiresVerification || response.status === 403) {
          const verificationMessage = data.message || 'Please complete account verification before posting items.';
          setError(`${errorMsg}: ${verificationMessage}`);
          // Optionally redirect to verification page after a delay
          setTimeout(() => {
            router.push('/verification');
          }, 3000);
        } else {
          setError(errorMsg);
        }
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

  const handleSelectChange = (name: string, value: string) => {
    setFormData({
      ...formData,
      [name]: value
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

    // Upload images immediately
    await uploadImages(files);
  };

  const uploadImages = async (filesToUpload: File[]) => {
    setUploading(true);
    const token = localStorage.getItem('token');
    
    try {
      const uploadPromises = filesToUpload.map(async (file) => {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/upload', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });

        const result = await response.json();
        if (result.success) {
          return result.data.url;
        } else {
          throw new Error(result.error || 'Upload failed');
        }
      });

      const urls = await Promise.all(uploadPromises);
      setUploadedImageUrls(prev => [...prev, ...urls]);
      
    } catch (error) {
      console.error('Upload error:', error);
      setError('Failed to upload images. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    const newPreviews = imagePreviews.filter((_, i) => i !== index);
    const newUploadedUrls = uploadedImageUrls.filter((_, i) => i !== index);
    
    // Clean up removed preview
    URL.revokeObjectURL(imagePreviews[index]);
    
    setImages(newImages);
    setImagePreviews(newPreviews);
    setUploadedImageUrls(newUploadedUrls);
  };

  return (
    <ProtectedRoute 
      userTypes={['ngo', 'company']} 
      requireVerification={true}
      permission="canCreateMarketplaceListings"
    >
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

              {user && user.verification_status !== 'verified' && (
                <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-md">
                  <div className="flex items-start gap-3">
                    <div className="text-amber-600">⚠️</div>
                    <div>
                      <p className="text-amber-800 font-medium text-sm">Verification Required</p>
                      <p className="text-amber-700 text-sm mt-1">
                        You need to complete account verification before you can post items. 
                        <Link href="/verification" className="underline font-medium ml-1 hover:text-amber-900">
                          Complete verification now
                        </Link>
                      </p>
                    </div>
                  </div>
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
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
                      <input
                        id="images"
                        type="file"
                        multiple
                        accept="image/jpeg,image/jpg,image/png,image/webp"
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                      <div className="text-center">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => document.getElementById('images')?.click()}
                          disabled={uploading}
                          className="mb-4"
                        >
                          {uploading ? 'Uploading...' : 'Choose Images'}
                        </Button>
                        <p className="text-sm text-gray-500">
                          Upload up to 5 images (max 5MB each). Supports JPEG, PNG, WebP
                        </p>
                      </div>
                      
                      {/* Image Previews */}
                      {imagePreviews.length > 0 && (
                        <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4">
                          {imagePreviews.map((preview, index) => (
                            <div key={index} className="relative">
                              <img
                                src={preview}
                                alt={`Preview ${index + 1}`}
                                className="w-full h-32 object-cover rounded-lg"
                              />
                              <button
                                type="button"
                                onClick={() => removeImage(index)}
                                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm hover:bg-red-600"
                              >
                                ×
                              </button>
                              {uploadedImageUrls[index] && (
                                <div className="absolute bottom-2 right-2 bg-green-500 text-white rounded-full w-6 h-6 flex items-center justify-center">
                                  ✓
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label htmlFor="category">Category *</Label>
                      <Select value={formData.category} onValueChange={(value) => handleSelectChange('category', value)}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a category" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((category) => (
                            <SelectItem key={category} value={category}>
                              {category}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                      <Select value={formData.condition_type} onValueChange={(value) => handleSelectChange('condition_type', value)}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select item condition" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new">New</SelectItem>
                          <SelectItem value="like_new">Like New</SelectItem>
                          <SelectItem value="good">Good</SelectItem>
                          <SelectItem value="fair">Fair</SelectItem>
                          <SelectItem value="poor">Poor</SelectItem>
                        </SelectContent>
                      </Select>
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

                  {/* Location Information Section */}
                  <div className="border-t pt-6">
                    <h3 className="text-lg font-semibold mb-4">📍 Location Information</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      This helps buyers find items near them
                    </p>
                    
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <Label htmlFor="city">City</Label>
                        <Input
                          id="city"
                          name="city"
                          value={formData.city}
                          onChange={handleChange}
                          placeholder="e.g., Mumbai, Delhi, Bangalore"
                        />
                      </div>
                      <div>
                        <Label htmlFor="state_province">State/Province</Label>
                        <Input
                          id="state_province"
                          name="state_province"
                          value={formData.state_province}
                          onChange={handleChange}
                          placeholder="e.g., Maharashtra, Delhi, Karnataka"
                        />
                      </div>
                    </div>
                    
                    <div className="grid gap-4 md:grid-cols-2 mt-4">
                      <div>
                        <Label htmlFor="pincode">Pin Code</Label>
                        <Input
                          id="pincode"
                          name="pincode"
                          value={formData.pincode}
                          onChange={handleChange}
                          placeholder="e.g., 400001, 110001"
                        />
                      </div>
                      <div>
                        <Label htmlFor="country">Country</Label>
                        <Input
                          id="country"
                          name="country"
                          value={formData.country}
                          onChange={handleChange}
                        />
                      </div>
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

                  {/* Who Can Buy Section */}
                  <div className="border-t pt-6">
                    <div className="space-y-3">
                      <Label className="text-base font-semibold">Who Can Buy This Item? *</Label>
                      <p className="text-sm text-muted-foreground">
                        Select which user types are eligible to purchase this item. This helps ensure your items reach the right beneficiaries.
                      </p>
                      
                      <div className="space-y-2 pt-2">
                        <div className="flex items-center space-x-2 p-3 rounded-md border hover:bg-accent transition-colors">
                          <input
                            type="checkbox"
                            id="buy-ngo"
                            checked={whoCanBuy.includes('ngo')}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setWhoCanBuy([...whoCanBuy, 'ngo']);
                              } else {
                                setWhoCanBuy(whoCanBuy.filter(t => t !== 'ngo'));
                              }
                            }}
                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                          />
                          <Label htmlFor="buy-ngo" className="flex items-center gap-2 cursor-pointer font-normal">
                            <Users className="h-4 w-4 text-blue-600" />
                            <span>NGOs</span>
                            <span className="text-xs text-muted-foreground">(Non-profit organizations)</span>
                          </Label>
                        </div>
                        
                        <div className="flex items-center space-x-2 p-3 rounded-md border hover:bg-accent transition-colors">
                          <input
                            type="checkbox"
                            id="buy-individual"
                            checked={whoCanBuy.includes('individual')}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setWhoCanBuy([...whoCanBuy, 'individual']);
                              } else {
                                setWhoCanBuy(whoCanBuy.filter(t => t !== 'individual'));
                              }
                            }}
                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                          />
                          <Label htmlFor="buy-individual" className="flex items-center gap-2 cursor-pointer font-normal">
                            <User className="h-4 w-4 text-green-600" />
                            <span>Individuals</span>
                            <span className="text-xs text-muted-foreground">(Private users)</span>
                          </Label>
                        </div>
                        
                        <div className="flex items-center space-x-2 p-3 rounded-md border hover:bg-accent transition-colors">
                          <input
                            type="checkbox"
                            id="buy-company"
                            checked={whoCanBuy.includes('company')}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setWhoCanBuy([...whoCanBuy, 'company']);
                              } else {
                                setWhoCanBuy(whoCanBuy.filter(t => t !== 'company'));
                              }
                            }}
                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                          />
                          <Label htmlFor="buy-company" className="flex items-center gap-2 cursor-pointer font-normal">
                            <Building className="h-4 w-4 text-purple-600" />
                            <span>Companies</span>
                            <span className="text-xs text-muted-foreground">(Corporate buyers via CSR)</span>
                          </Label>
                        </div>
                      </div>
                      
                      {whoCanBuy.length === 0 && (
                        <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded p-2 mt-2">
                          ⚠️ Please select at least one buyer type
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Product Specifications Section */}
                  <div className="border-t pt-6">
                    <h3 className="text-lg font-semibold mb-4">Product Specifications (Optional)</h3>
                    
                    <div className="grid gap-4">
                      {/* Brand and Weight */}
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <Label htmlFor="brand">Brand</Label>
                          <Input
                            id="brand"
                            name="brand"
                            value={formData.brand}
                            onChange={handleChange}
                            placeholder="e.g., Samsung, Apple, Nike"
                          />
                        </div>
                        <div>
                          <Label htmlFor="weight_kg">Weight (kg)</Label>
                          <Input
                            id="weight_kg"
                            name="weight_kg"
                            type="number"
                            step="0.01"
                            min="0"
                            value={formData.weight_kg}
                            onChange={handleChange}
                            placeholder="e.g., 1.5"
                          />
                        </div>
                      </div>

                      {/* Dimensions */}
                      <div>
                        <Label>Dimensions (cm)</Label>
                        <div className="grid gap-4 md:grid-cols-3 mt-2">
                          <div>
                            <Input
                              name="dimensions_length"
                              type="number"
                              step="0.1"
                              min="0"
                              value={formData.dimensions_length}
                              onChange={handleChange}
                              placeholder="Length"
                            />
                          </div>
                          <div>
                            <Input
                              name="dimensions_width"
                              type="number"
                              step="0.1"
                              min="0"
                              value={formData.dimensions_width}
                              onChange={handleChange}
                              placeholder="Width"
                            />
                          </div>
                          <div>
                            <Input
                              name="dimensions_height"
                              type="number"
                              step="0.1"
                              min="0"
                              value={formData.dimensions_height}
                              onChange={handleChange}
                              placeholder="Height"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Custom Specifications */}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <Label>Additional Specifications</Label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={addCustomSpec}
                            className="text-sm"
                          >
                            <Plus size={14} className="mr-1" />
                            Add Specification
                          </Button>
                        </div>
                        
                        {customSpecs.map((spec, index) => (
                          <div key={index} className="grid gap-2 md:grid-cols-[1fr,1fr,auto] mb-2">
                            <Input
                              placeholder="Specification name (e.g., Color, Size, Material)"
                              value={spec.key}
                              onChange={(e) => updateCustomSpec(index, 'key', e.target.value)}
                            />
                            <Input
                              placeholder="Specification value (e.g., Red, Large, Cotton)"
                              value={spec.value}
                              onChange={(e) => updateCustomSpec(index, 'value', e.target.value)}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => removeCustomSpec(index)}
                              className="text-red-600 hover:text-red-700"
                            >
                              Remove
                            </Button>
                          </div>
                        ))}
                        
                        {customSpecs.length === 0 && (
                          <p className="text-sm text-muted-foreground">
                            Add custom specifications like color, size, material, etc.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 pt-6">
                  <Button 
                    type="submit" 
                    disabled={loading || !!(user && user.verification_status !== 'verified')} 
                    className="flex-1"
                  >
                    {loading ? 'Creating...' : 
                     user && user.verification_status !== 'verified' ? 'Verification Required' : 
                     'Create Listing'}
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