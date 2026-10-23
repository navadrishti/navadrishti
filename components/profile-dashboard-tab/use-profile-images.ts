"use client"

import { useState } from 'react'
import { toast } from 'sonner'

async function uploadImage(file: File): Promise<string> {
  const token = localStorage.getItem('token')
  if (!token) {
    throw new Error('Authentication required. Please log in again.')
  }

  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch('/api/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || 'Upload failed')
  }

  const result = await response.json()
  return result.data.url
}

async function persistCoverImage(imageUrl: string) {
  const token = localStorage.getItem('token')
  if (!token) {
    throw new Error('Authentication required. Please log in again.')
  }

  const saveResponse = await fetch('/api/profile/update', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ coverImageUrl: imageUrl }),
  })

  if (!saveResponse.ok) {
    throw new Error('Failed to persist cover photo')
  }
}

export function useProfileImages(refreshUser: () => Promise<void>) {
  const [profileImageUrl, setProfileImageUrl] = useState('')
  const [coverImageUrl, setCoverImageUrl] = useState('')
  const [uploadingProfileImage, setUploadingProfileImage] = useState(false)
  const [uploadingCoverImage, setUploadingCoverImage] = useState(false)

  const handleProfileImageUpload = async (file: File) => {
    try {
      setUploadingProfileImage(true)
      const imageUrl = await uploadImage(file)
      setProfileImageUrl(imageUrl)

      const saveResponse = await fetch('/api/profile/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ profileImageUrl: imageUrl }),
      })

      if (!saveResponse.ok) {
        throw new Error('Failed to persist profile image')
      }

      await refreshUser()
      toast.success('Profile picture updated successfully!')
    } catch (error) {
      console.error('Error uploading profile image:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to upload profile picture.')
    } finally {
      setUploadingProfileImage(false)
    }
  }

  const handleCoverImageUpload = async (file: File) => {
    try {
      setUploadingCoverImage(true)
      const imageUrl = await uploadImage(file)
      setCoverImageUrl(imageUrl)
      await persistCoverImage(imageUrl)
      await refreshUser()
      toast.success('Cover photo updated successfully!')
    } catch (error) {
      console.error('Error uploading cover photo:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to upload cover photo.')
    } finally {
      setUploadingCoverImage(false)
    }
  }

  const handleRemoveCoverImage = async () => {
    try {
      setUploadingCoverImage(true)
      setCoverImageUrl('')
      await persistCoverImage('')
      await refreshUser()
      toast.success('Cover photo removed')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove cover photo.')
    } finally {
      setUploadingCoverImage(false)
    }
  }

  return {
    profileImageUrl,
    setProfileImageUrl,
    coverImageUrl,
    setCoverImageUrl,
    uploadingProfileImage,
    uploadingCoverImage,
    handleProfileImageUpload,
    handleCoverImageUpload,
    handleRemoveCoverImage,
  }
}

export type ProfileImages = ReturnType<typeof useProfileImages>
