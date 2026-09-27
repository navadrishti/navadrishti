import { useEffect, useState } from 'react'

export function useDocumentPreviewUrl(url: string, isImage: boolean, isPdf: boolean) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(isImage ? url : null)

  useEffect(() => {
    if (isImage) {
      setPreviewUrl(url)
      return
    }

    let cancelled = false
    let objectUrl: string | null = null
    setPreviewUrl(null)

    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error('Failed to load document')
        return response.blob()
      })
      .then((blob) => {
        if (cancelled) return
        const typed = isPdf ? new Blob([blob], { type: 'application/pdf' }) : blob
        objectUrl = URL.createObjectURL(typed)
        setPreviewUrl(objectUrl)
      })
      .catch(() => {
        if (!cancelled) setPreviewUrl(url)
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [url, isImage, isPdf])

  return previewUrl
}
