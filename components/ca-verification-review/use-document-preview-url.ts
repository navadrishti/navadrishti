import { useEffect, useState } from 'react'

export function useDocumentPreviewUrl(url: string, isImage: boolean, isPdf: boolean) {
  const [loaded, setLoaded] = useState<{ source: string; previewUrl: string } | null>(null)

  useEffect(() => {
    if (isImage) return

    let cancelled = false
    let objectUrl: string | null = null

    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error('Failed to load document')
        return response.blob()
      })
      .then((blob) => {
        if (cancelled) return
        const typed = isPdf ? new Blob([blob], { type: 'application/pdf' }) : blob
        objectUrl = URL.createObjectURL(typed)
        setLoaded({ source: url, previewUrl: objectUrl })
      })
      .catch(() => {
        if (!cancelled) setLoaded({ source: url, previewUrl: url })
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [url, isImage, isPdf])

  if (isImage) return url
  return loaded?.source === url ? loaded.previewUrl : null
}
