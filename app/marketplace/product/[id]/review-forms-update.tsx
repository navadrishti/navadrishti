// This file contains the updated EditReviewForm and ReviewForm components with image upload
// Copy the relevant parts to page.tsx

// Updated handleUpdateReview function - replaces the existing one around line 299
const handleUpdateReview = async (reviewId: number, rating: number, title: string, reviewText: string, images: string[]) => {
  try {
    const response = await fetch(`/api/marketplace/product/${resolvedParams.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: 'update_review',
        reviewId,
        rating,
        title: title.trim() || null,
        review_text: reviewText.trim(),
        images
      })
    })

    const result = await response.json()

    if (response.ok) {
      toast.success('Review updated successfully')
      setEditingReviewId(null)
      fetchProduct()
    } else {
      toast.error(result.error || 'Failed to update review')
    }
  } catch (error) {
    console.error('Update review error:', error)
    toast.error('Failed to update review')
  }
}

// Updated EditReviewForm component - replaces the existing one around line 334
const EditReviewForm = ({ review, onCancel, onUpdate }: { 
  review: any, 
  onCancel: () => void, 
  onUpdate: (reviewId: number, rating: number, title: string, reviewText: string, images: string[]) => void 
}) => {
  const [rating, setRating] = useState(review.rating)
  const [hoveredRating, setHoveredRating] = useState(0)
  const [title, setTitle] = useState(review.title || '')
  const [reviewText, setReviewText] = useState(review.review_text || '')
  const [images, setImages] = useState<string[]>(review.images || [])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const { token } = useAuth()

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    if (images.length + files.length > 5) {
      toast.error('Maximum 5 images allowed per review')
      return
    }

    setUploading(true)

    try {
      const uploadPromises = Array.from(files).map(async (file) => {
        if (file.size > 5 * 1024 * 1024) {
          toast.error(`${file.name} is too large. Max 5MB per image.`)
          return null
        }

        const formData = new FormData()
        formData.append('file', file)

        const response = await fetch('/api/upload', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        })

        if (!response.ok) {
          const error = await response.json()
          toast.error(error.error || 'Failed to upload image')
          return null
        }

        const data = await response.json()
        return data.url
      })

      const uploadedUrls = await Promise.all(uploadPromises)
      const validUrls = uploadedUrls.filter(url => url !== null) as string[]
      
      setImages([...images, ...validUrls])
      toast.success(`${validUrls.length} image(s) uploaded successfully`)
    } catch (error) {
      console.error('Image upload error:', error)
      toast.error('Failed to upload images')
    } finally {
      setUploading(false)
    }
  }

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (rating === 0) {
      toast.error('Please select a rating')
      return
    }

    if (!reviewText.trim()) {
      toast.error('Please write a review')
      return
    }

    setSubmitting(true)
    await onUpdate(review.id, rating, title, reviewText, images)
    setSubmitting(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 border rounded-lg bg-gray-50">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold">Edit Your Review</h4>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Rating *</label>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              onMouseEnter={() => setHoveredRating(star)}
              onMouseLeave={() => setHoveredRating(0)}
              className="transition-transform hover:scale-110"
            >
              <Star
                size={32}
                className={`${
                  star <= (hoveredRating || rating)
                    ? 'fill-yellow-400 text-yellow-400'
                    : 'text-gray-300'
                } transition-colors`}
              />
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Review Title (Optional)</label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Summarize your review..."
          maxLength={100}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Your Review *</label>
        <Textarea
          value={reviewText}
          onChange={(e) => setReviewText(e.target.value)}
          placeholder="Share your experience with this product..."
          rows={4}
          maxLength={1000}
          required
        />
        <div className="text-xs text-gray-500 mt-1">
          {reviewText.length}/1000 characters
        </div>
      </div>

      {/* Image Upload Section */}
      <div>
        <label className="block text-sm font-medium mb-2">
          Photos (Optional, max 5)
        </label>
        
        {images.length < 5 && (
          <div className="mb-3">
            <label className="flex items-center justify-center w-full h-24 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all">
              <div className="text-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-8 w-8 text-gray-400 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-sm text-gray-600">
                  {uploading ? 'Uploading...' : 'Click to upload images'}
                </span>
                <span className="text-xs text-gray-500 block">PNG, JPG, WebP (max 5MB each)</span>
              </div>
              <input
                type="file"
                className="hidden"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                disabled={uploading || images.length >= 5}
              />
            </label>
          </div>
        )}

        {images.length > 0 && (
          <div className="grid grid-cols-5 gap-2">
            {images.map((image, index) => (
              <div key={index} className="relative group">
                <img
                  src={image}
                  alt={`Review image ${index + 1}`}
                  className="w-full h-20 object-cover rounded-lg border border-gray-200"
                />
                <button
                  type="button"
                  onClick={() => removeImage(index)}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:bg-red-600"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={submitting || uploading || rating === 0 || !reviewText.trim()}>
          {submitting ? 'Updating...' : 'Update Review'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  )
}
