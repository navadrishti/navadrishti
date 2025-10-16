'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { use } from 'react'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, Upload, Save, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import ProtectedRoute from '@/components/protected-route'
import { toast } from 'sonner'

const categories = [
  'Electronics',
  'Clothing',
  'Books',
  'Furniture',
  'Toys',
  'Sports',
  'Health & Beauty',
  'Art & Crafts',
  'Other'
];

interface ListingData {
  id: number
  title: string
  description: string
  category: string
  price: number
  quantity: number
  stock_quantity: number
  selling_type: string
  bulk_min_quantity: number
  bulk_discount_percentage: number
  condition_type: string
  location: string
  tags: string[]
  images: string[]
  status: string
}

export default function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const resolvedParams = use(params)
  const { user } = useAuth()
  
  // Helper function to get appropriate dashboard link based on user type
  const getDashboardLink = () => {
    if (!user) return '/'
    switch (user.user_type) {
      case 'ngo': return '/ngos/dashboard'
      case 'company': return '/companies/dashboard'
      case 'individual': return '/individuals/dashboard'
      default: return '/'
    }
  }
  
  const [listing, setListing] = useState<ListingData | null>(null)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: '',
    price: '',
    quantity: 1,
    location: '',
    tags: '',
    condition_type: 'new',
    status: 'active'
  })
  const [images, setImages] = useState<File[]>([])
  const [existingImages, setExistingImages] = useState<string[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [uploadedImageUrls, setUploadedImageUrls] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchListing()
  }, [resolvedParams.id])

  const fetchListing = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('token')
      
      const response = await fetch(`/api/marketplace/product/${resolvedParams.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json()
      if (data.success && data.product) {
        const product = data.product
        
        // Check if current user is the owner
        if (product.seller_id !== user?.id) {
          toast.error('You can only edit your own listings')
          router.push(getDashboardLink())
          return
        }

        setListing(product)
        setFormData({
          title: product.title || '',
          description: product.description || '',
          category: product.category || '',
          price: product.price?.toString() || '',
          quantity: product.quantity || 1,
          location: product.location || '',
          tags: Array.isArray(product.tags) ? product.tags.join(', ') : '',
          condition_type: product.condition_type || 'new',
          status: product.status || 'active'
        })
        setExistingImages(product.images || [])
      } else {
        setError('Listing not found')
      }
    } catch (err) {
      console.error('Error fetching listing:', err)
      setError('Failed to load listing')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const uploadImages = async (files: FileList) => {
    const token = localStorage.getItem('token')
    if (!token) {
      toast.error('Authentication required')
      return []
    }

    const uploadPromises = Array.from(files).map(async (file) => {
      const formData = new FormData()
      formData.append('file', file)
      
      try {
        const response = await fetch('/api/upload', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        })
        
        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || `Failed to upload ${file.name}`)
        }
        
        const result = await response.json()
        // The API returns { success: true, data: { url: ... } }
        return result.data?.url || result.url
      } catch (error) {
        console.error(`Error uploading ${file.name}:`, error)
        throw error
      }
    })

    try {
      return await Promise.all(uploadPromises)
    } catch (error) {
      // If any upload fails, we still want to continue with the others
      console.error('Some uploads failed:', error)
      throw error
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    // Check total image limit (existing + new)
    const totalImagesCount = existingImages.length + imagePreviews.length + files.length
    if (totalImagesCount > 5) {
      toast.error('Maximum 5 images allowed')
      return
    }

    setUploading(true)
    
    try {
      // Create previews immediately
      const newPreviews = Array.from(files).map(file => URL.createObjectURL(file))
      setImagePreviews([...imagePreviews, ...newPreviews])
      setImages([...images, ...Array.from(files)])

      // Upload to Cloudinary
      const uploadedUrls = await uploadImages(files)
      setUploadedImageUrls([...uploadedImageUrls, ...uploadedUrls])
      
      toast.success(`${files.length} image(s) uploaded successfully`)
    } catch (error) {
      console.error('Error uploading images:', error)
      toast.error(`Failed to upload images: ${error instanceof Error ? error.message : 'Unknown error'}`)
      
      // Remove the failed previews
      const failedIndexes = Array.from(files).map((_, index) => imagePreviews.length + index)
      setImagePreviews(prev => prev.filter((_, index) => !failedIndexes.includes(index)))
      setImages(prev => prev.filter((_, index) => !failedIndexes.includes(index - (images.length - files.length))))
    } finally {
      setUploading(false)
      // Reset file input
      e.target.value = ''
    }
  }

  const removeExistingImage = (index: number) => {
    const newExistingImages = existingImages.filter((_, i) => i !== index)
    setExistingImages(newExistingImages)
  }

  const removeNewImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index)
    const newPreviews = imagePreviews.filter((_, i) => i !== index)
    const newUploadedUrls = uploadedImageUrls.filter((_, i) => i !== index)
    
    // Clean up removed preview
    if (imagePreviews[index]) {
      URL.revokeObjectURL(imagePreviews[index])
    }
    
    setImages(newImages)
    setImagePreviews(newPreviews)
    setUploadedImageUrls(newUploadedUrls)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!user || !listing) {
      setError('Authentication required')
      return
    }

    setSaving(true)
    setError('')

    try {
      const token = localStorage.getItem('token')
      
      // Combine existing and uploaded images
      const allImages = [...existingImages, ...uploadedImageUrls]
      
      const response = await fetch(`/api/marketplace/${listing.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...formData,
          price: parseFloat(formData.price),
          quantity: parseInt(formData.quantity.toString()),
          tags: formData.tags.split(',').map(tag => tag.trim()).filter(tag => tag),
          images: allImages
        })
      })

      const data = await response.json()

      if (data.success) {
        // Clean up image previews
        imagePreviews.forEach(preview => URL.revokeObjectURL(preview))
        toast.success('Listing updated successfully')
        router.push(getDashboardLink())
      } else {
        setError(data.message || 'Failed to update listing')
      }
    } catch (err) {
      setError('Error updating listing')
      console.error('Error:', err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-background">
          <Header />
          <main className="container mx-auto px-4 py-8">
            <div className="animate-pulse space-y-4">
              <div className="h-8 bg-gray-200 rounded w-1/4"></div>
              <div className="h-96 bg-gray-200 rounded"></div>
            </div>
          </main>
        </div>
      </ProtectedRoute>
    )
  }

  if (error && !listing) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-background">
          <Header />
          <main className="container mx-auto px-4 py-8">
            <div className="text-center py-16">
              <h2 className="text-2xl font-semibold mb-4">Error</h2>
              <p className="text-muted-foreground mb-4">{error}</p>
              <Button onClick={() => router.push(getDashboardLink())}>
                Back to Dashboard
              </Button>
            </div>
          </main>
        </div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background">
        <Header />
        
        <main className="container mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <Link href={getDashboardLink()} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4">
              <ArrowLeft size={16} />
              Back to Dashboard
            </Link>
            
            <h1 className="text-3xl font-bold tracking-tight">Edit Listing</h1>
            <p className="text-muted-foreground">
              Update your listing details
            </p>
          </div>

          <div className="max-w-2xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle>Listing Details</CardTitle>
                <CardDescription>
                  Make changes to your listing information
                </CardDescription>
              </CardHeader>
              <CardContent>
                {error && (
                  <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-red-700 text-sm">{error}</p>
                  </div>
                )}
                
                <form onSubmit={handleSave} className="space-y-6">
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

                    {/* Image Management */}
                    <div>
                      <Label>Product Images</Label>
                      
                      {/* Existing Images */}
                      {existingImages.length > 0 && (
                        <div className="mt-2">
                          <p className="text-sm text-muted-foreground mb-2">Current Images:</p>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                            {existingImages.map((image, index) => (
                              <div key={index} className="relative group">
                                <img
                                  src={image}
                                  alt={`Existing ${index + 1}`}
                                  className="w-full h-24 object-cover rounded-lg border"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeExistingImage(index)}
                                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* New Image Upload */}
                      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
                        <input
                          type="file"
                          multiple
                          accept="image/jpeg,image/jpg,image/png,image/webp"
                          onChange={handleImageUpload}
                          className="hidden"
                          id="image-upload"
                        />
                        <div className="text-center">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => document.getElementById('image-upload')?.click()}
                            disabled={uploading || (existingImages.length + imagePreviews.length) >= 5}
                            className="mb-4"
                          >
                            {uploading ? 'Uploading...' : 'Add More Images'}
                          </Button>
                          <p className="text-sm text-gray-500">
                            Upload up to {5 - existingImages.length} more images (max 5MB each). Supports JPEG, PNG, WebP
                          </p>
                        </div>
                        
                        {/* New Image Previews */}
                        {imagePreviews.length > 0 && (
                          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4">
                            {imagePreviews.map((preview, index) => (
                              <div key={index} className="relative">
                                <img
                                  src={preview}
                                  alt={`New image ${index + 1}`}
                                  className="w-full h-32 object-cover rounded-lg"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeNewImage(index)}
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
                    {/* Stock & Status Section */}
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <Label htmlFor="condition_type">Condition *</Label>
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
                        <Label htmlFor="status">Status *</Label>
                        <select
                          id="status"
                          name="status"
                          value={formData.status}
                          onChange={handleChange}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          required
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                          <option value="out_of_stock">Out of Stock</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <Label htmlFor="quantity">Available Quantity</Label>
                        <Input
                          id="quantity"
                          name="quantity"
                          type="number"
                          min="1"
                          value={formData.quantity}
                          onChange={handleChange}
                        />
                      </div>

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
                    <Button type="submit" disabled={saving} className="flex-1">
                      <Save className="mr-2 h-4 w-4" />
                      {saving ? 'Saving...' : 'Save Changes'}
                    </Button>
                    <Button type="button" variant="outline" asChild>
                      <Link href={getDashboardLink()}>Cancel</Link>
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  )
}