import { useRef } from 'react'

import { Label } from '@/components/ui/label'

import { appendImageUrls, parseImageUrls } from './helpers'
import type { ServiceOfferForm } from './use-service-offer-form'

export function ImagesField({ form }: { form: ServiceOfferForm }) {
  const { formData, setField, handleUpload } = form
  const imagesTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const imageUrls = parseImageUrls(formData.images)

  return (
    <div>
      <Label htmlFor="offer-images">Images</Label>
      <div className="flex items-center gap-4">
        <label className="inline-flex items-center px-4 py-2 bg-udaan-blue text-white rounded-md cursor-pointer hover:bg-udaan-blue/90 focus:outline-none focus:ring-2 focus:ring-udaan-blue/30">
          Choose files
          <input
            id="offer-images-upload"
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(event) => void handleUpload(event.target.files).then((result) => {
              if (result.urls.length > 0) {
                setField('images', appendImageUrls(formData.images, result.urls))
              }
            })}
          />
        </label>
        <span className="text-sm text-gray-600">{imageUrls.length > 0 ? `${imageUrls.length} file(s) selected` : 'No files chosen'}</span>
      </div>

      {/* The textarea holds the real URL list; users reach it by clicking the preview area below. */}
      <textarea
        id="offer-images"
        value={formData.images}
        onChange={(e) => setField('images', e.target.value)}
        className="sr-only"
        ref={imagesTextareaRef}
        rows={3}
      />

      <div
        onClick={() => imagesTextareaRef.current?.focus()}
        className="mt-3 min-h-[80px] border border-gray-200 rounded-md p-3 bg-white cursor-text"
      >
        {imageUrls.length === 0 ? (
          <p className="text-gray-400">Uploaded Cloudinary images appear here. Click to paste image URLs, one per line.</p>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {imageUrls.map((url) => (
              <div key={url} className="w-full h-20 rounded overflow-hidden border border-gray-200 bg-gray-50">
                <img src={url} alt="uploaded" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="mt-1 text-xs text-gray-500">Leave blank to show the no-image placeholder on request cards.</p>
    </div>
  )
}
