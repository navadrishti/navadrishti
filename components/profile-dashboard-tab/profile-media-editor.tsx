"use client"

import { Camera } from 'lucide-react'
import { getGramAvatarFallbackStyle } from '@/lib/gram-avatar'
import { Button } from '@/components/ui/button'
import { ProfileCoverMedia } from '@/components/profile-card'
import type { ProfileImages } from './use-profile-images'

interface ProfileMediaEditorProps {
  images: ProfileImages
  userName: string | undefined
}

export function ProfileMediaEditor({ images, userName }: ProfileMediaEditorProps) {
  const {
    profileImageUrl,
    coverImageUrl,
    uploadingProfileImage,
    uploadingCoverImage,
    handleProfileImageUpload,
    handleCoverImageUpload,
    handleRemoveCoverImage,
  } = images

  return (
    <div className="overflow-hidden rounded-lg border pb-4">
      <div className="relative">
        <ProfileCoverMedia src={coverImageUrl} className="h-36 w-full sm:h-44" alt="Cover photo" />
        <div className="absolute bottom-3 right-3 flex gap-2">
          <label className="cursor-pointer">
            <span className="inline-flex h-9 items-center gap-2 rounded-md border border-white/30 bg-black/45 px-3 text-xs font-medium text-white hover:bg-black/60">
              <Camera className="h-3.5 w-3.5" />
              {uploadingCoverImage ? 'Uploading...' : coverImageUrl ? 'Change cover' : 'Add cover'}
            </span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleCoverImageUpload(file)
              }}
              className="hidden"
              disabled={uploadingCoverImage}
            />
          </label>
          {coverImageUrl ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 border-white/30 bg-black/45 text-xs text-white hover:bg-black/60 hover:text-white"
              onClick={() => void handleRemoveCoverImage()}
              disabled={uploadingCoverImage}
            >
              Remove
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col items-start gap-3 px-4">
        <div className="-mt-12 relative">
          <div className="h-24 w-24 overflow-hidden rounded-full border-4 border-white bg-white shadow-sm">
            {profileImageUrl ? (
              <img src={profileImageUrl} alt="Profile" className="h-full w-full object-cover" />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center text-xl font-semibold"
                style={getGramAvatarFallbackStyle(userName || 'U')}
              >
                {userName ? userName.split(' ').map((n) => n[0]).join('').toUpperCase() : 'U'}
              </div>
            )}
          </div>
        </div>
        <label className="cursor-pointer">
          <Button variant="outline" size="sm" disabled={uploadingProfileImage} asChild className="w-full max-w-full whitespace-normal break-words text-center">
            <span>{uploadingProfileImage ? 'Uploading...' : 'Change Profile Picture'}</span>
          </Button>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleProfileImageUpload(file)
            }}
            className="hidden"
            disabled={uploadingProfileImage}
          />
        </label>
      </div>
    </div>
  )
}
