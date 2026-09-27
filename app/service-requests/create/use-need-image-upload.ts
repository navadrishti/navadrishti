import { useState, type Dispatch, type SetStateAction } from 'react'
import { parseImageUrls } from './helpers'
import type { NeedDraft, UploadProgressState } from './types'

export function useNeedImageUpload(
  setNeeds: Dispatch<SetStateAction<NeedDraft[]>>,
  setError: (message: string) => void
) {
  const [needUploadProgress, setNeedUploadProgress] = useState<Record<number, UploadProgressState>>({})

  const appendNeedImageUrls = (index: number, urls: string[]) => {
    if (urls.length === 0) return

    setNeeds((prev) => prev.map((need, needIndex) => {
      if (needIndex !== index) return need
      const existingUrls = parseImageUrls(need.images)
      return {
        ...need,
        images: [...existingUrls, ...urls].join('\n')
      }
    }))
  }

  const removeNeedImageUrl = (index: number, urlToRemove: string) => {
    setNeeds((prev) => prev.map((need, needIndex) => {
      if (needIndex !== index) return need
      return {
        ...need,
        images: parseImageUrls(need.images).filter((url) => url !== urlToRemove).join('\n')
      }
    }))
  }

  const handleNeedImageFiles = async (index: number, files: FileList | null) => {
    if (!files || files.length === 0) return

    const token = localStorage.getItem('token')
    const uploadedUrls: string[] = []
    const failedFiles: string[] = []
    const total = files.length

    setNeedUploadProgress((prev) => ({
      ...prev,
      [index]: { active: true, current: 0, total }
    }))

    let completed = 0
    for (const file of Array.from(files)) {
      try {
        const uploadData = new FormData()
        uploadData.append('file', file)

        const response = await fetch('/api/upload', {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          body: uploadData
        })

        const data = await response.json()
        if (!response.ok || !data.success || !data.data?.url) {
          throw new Error(data.error || 'Failed to upload image')
        }

        uploadedUrls.push(data.data.url)
      } catch {
        failedFiles.push(file.name)
      } finally {
        completed += 1
        setNeedUploadProgress((prev) => ({
          ...prev,
          [index]: { active: true, current: completed, total }
        }))
      }
    }

    appendNeedImageUrls(index, uploadedUrls)

    setNeedUploadProgress((prev) => ({
      ...prev,
      [index]: { active: false, current: total, total }
    }))

    if (failedFiles.length > 0) {
      setError(`Could not upload ${failedFiles.length} image(s) for Need ${index + 1}.`)
    }
  }

  return { needUploadProgress, handleNeedImageFiles, removeNeedImageUrl }
}
