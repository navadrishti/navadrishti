'use client'

import { DocumentPreview } from './document-preview'
import { isDocumentImageUrl, isDocumentPdfUrl } from './helpers'
import { useDocumentPreviewUrl } from './use-document-preview-url'

export function DocumentFileViewer({
  url,
  label,
  fileName,
  onBack,
}: {
  url: string
  label: string
  fileName?: string
  onBack?: () => void
}) {
  const isImage = isDocumentImageUrl(url, fileName)
  const isPdf = isDocumentPdfUrl(url, fileName)
  const previewUrl = useDocumentPreviewUrl(url, isImage, isPdf)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-sm font-medium text-slate-900">{label}</p>
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="shrink-0 text-xs font-medium text-udaan-blue"
          >
            Back
          </button>
        ) : null}
      </div>
      {previewUrl ? (
        <DocumentPreview src={previewUrl} alt={label} isImage={isImage} />
      ) : (
        <p className="p-6 text-sm text-slate-500">Opening document...</p>
      )}
    </div>
  )
}
