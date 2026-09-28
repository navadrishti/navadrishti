import { Label } from '@/components/ui/label'
import { parseImageUrls } from './helpers'
import type { UploadProgressState } from './types'

interface NeedImagesFieldProps {
  index: number
  images: string
  uploadProgress?: UploadProgressState
  onFilesSelected: (files: FileList | null) => void
  onRemoveImage: (url: string) => void
}

export function NeedImagesField({ index, images, uploadProgress, onFilesSelected, onRemoveImage }: NeedImagesFieldProps) {
  const imageUrls = parseImageUrls(images)

  return (
    <div>
      <Label htmlFor={`need-images-${index}`}>Images</Label>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <label className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md cursor-pointer hover:bg-gram-page focus:outline-none focus:ring-2 focus:ring-udaan-blue/30">
          Choose files
          <input
            id={`need-images-${index}`}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(event) => onFilesSelected(event.target.files)}
          />
        </label>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm text-gray-600">{imageUrls.length > 0 ? `${imageUrls.length} file(s) selected` : 'No files chosen'}</span>
          {uploadProgress?.active && (
            <div className="flex items-center gap-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 sm:w-40">
                <div
                  className="h-full rounded-full bg-udaan-blue transition-all"
                  style={{ width: `${Math.max(5, (uploadProgress.current / Math.max(1, uploadProgress.total)) * 100)}%` }}
                />
              </div>
              <span className="shrink-0 text-xs text-gray-500">
                {uploadProgress.current}/{uploadProgress.total}
              </span>
            </div>
          )}
        </div>
      </div>

      {imageUrls.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-3">
          {imageUrls.map((url) => (
            <div key={url} className="relative h-20 w-20 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
              {/* eslint-disable-next-line @next/next/no-img-element -- previews freshly uploaded URLs that may not match images.remotePatterns */}
              <img src={url} alt="uploaded" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => onRemoveImage(url)}
                className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white hover:bg-red-600"
                aria-label="Remove image"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="mt-1 text-xs text-muted-foreground">Add one or more images for this need. Cards will show the uploaded images or the no-image placeholder.</p>
    </div>
  )
}
