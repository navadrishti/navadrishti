"use client"

import React, { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Upload, Camera, X, FileImage, CheckCircle, AlertCircle, User } from 'lucide-react'
import { toast } from 'sonner'

interface FileUploadProps {
  // Configuration
  accept?: string
  multiple?: boolean
  maxFiles?: number
  maxSize?: number // in MB
  recommendedSize?: string // display text like "500KB recommended"
  
  // Labels and descriptions
  title: string
  description?: string
  dragText?: string
  
  // Current files
  files?: File[]
  existingImages?: string[] // URLs for existing images
  
  // Callbacks
  onFilesChange: (files: File[]) => void
  onRemoveExisting?: (index: number) => void
  
  // Styling
  variant?: 'default' | 'profile' | 'gallery'
  className?: string
  
  // Validation
  allowedTypes?: string[]
}

export function FileUpload({
  accept = "image/*",
  multiple = false,
  maxFiles = 1,
  maxSize = 5, // 5MB default
  recommendedSize,
  title,
  description,
  dragText = "Click to browse or drag and drop",
  files = [],
  existingImages = [],
  onFilesChange,
  onRemoveExisting,
  variant = 'default',
  className = "",
  allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
}: FileUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const totalFiles = files.length + existingImages.length
  const canAddMore = totalFiles < maxFiles

  const validateFile = (file: File): boolean => {
    // Check file type
    if (!allowedTypes.includes(file.type)) {
      toast.error(`Please select a valid file type (${allowedTypes.map(type => type.split('/')[1].toUpperCase()).join(', ')})`)
      return false
    }

    // Check file size
    const maxSizeBytes = maxSize * 1024 * 1024
    if (file.size > maxSizeBytes) {
      toast.error(`File size must be less than ${maxSize}MB`)
      return false
    }

    return true
  }

  const handleFileSelect = (selectedFiles: FileList | null) => {
    if (!selectedFiles) return

    const newFiles = Array.from(selectedFiles)
    const validFiles: File[] = []

    for (const file of newFiles) {
      if (!validateFile(file)) continue
      
      if (totalFiles + validFiles.length >= maxFiles) {
        toast.error(`Maximum ${maxFiles} ${maxFiles === 1 ? 'file' : 'files'} allowed`)
        break
      }
      
      validFiles.push(file)
    }

    if (validFiles.length > 0) {
      if (multiple) {
        onFilesChange([...files, ...validFiles])
      } else {
        onFilesChange([validFiles[0]])
      }
      toast.success(`${validFiles.length} ${validFiles.length === 1 ? 'file' : 'files'} selected successfully`)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files)
    // Reset input value to allow re-selecting the same file
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    handleFileSelect(e.dataTransfer.files)
  }

  const removeFile = (index: number) => {
    const newFiles = files.filter((_, i) => i !== index)
    onFilesChange(newFiles)
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  const renderUploadArea = () => {
    if (variant === 'profile' && !canAddMore && files.length > 0) {
      return (
        <div className="flex items-start gap-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
          <div className="relative w-20 h-20 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0">
            <Avatar className="w-full h-full">
              <AvatarImage 
                src={URL.createObjectURL(files[0])} 
                alt="Profile preview" 
                className="object-cover"
              />
              <AvatarFallback>
                <User className="h-10 w-10 text-gray-400" />
              </AvatarFallback>
            </Avatar>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{files[0].name}</p>
            <p className="text-xs text-gray-500">{formatFileSize(files[0].size)}</p>
            {recommendedSize && (
              <p className="text-xs text-gray-400 mt-1">Recommended: {recommendedSize}</p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-xs text-green-600">Ready to upload</span>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => removeFile(0)}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            Remove
          </Button>
        </div>
      )
    }

    return (
      <div className="relative">
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleInputChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          disabled={!canAddMore}
        />
        <div 
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
            !canAddMore 
              ? 'border-gray-200 bg-gray-50 cursor-not-allowed' 
              : isDragOver 
                ? 'border-udaan-orange bg-orange-50' 
                : 'border-gray-300 hover:border-udaan-orange hover:bg-orange-50 cursor-pointer'
          }`}
          onDragOver={canAddMore ? handleDragOver : undefined}
          onDragLeave={canAddMore ? handleDragLeave : undefined}
          onDrop={canAddMore ? handleDrop : undefined}
        >
          <div className="flex flex-col items-center">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${
              !canAddMore ? 'bg-gray-200' : 'bg-gray-100'
            }`}>
              {variant === 'profile' ? (
                <Camera className={`h-6 w-6 ${!canAddMore ? 'text-gray-400' : 'text-gray-500'}`} />
              ) : (
                <Upload className={`h-6 w-6 ${!canAddMore ? 'text-gray-400' : 'text-gray-500'}`} />
              )}
            </div>
            <p className={`text-sm font-medium mb-1 ${
              !canAddMore ? 'text-gray-400' : 'text-gray-900'
            }`}>
              {!canAddMore ? `Maximum ${maxFiles} ${maxFiles === 1 ? 'file' : 'files'} reached` : title}
            </p>
            {canAddMore && (
              <>
                <p className="text-xs text-gray-500">{dragText}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {allowedTypes.map(type => type.split('/')[1].toUpperCase()).join(', ')} up to {maxSize}MB
                  {multiple && ` (max ${maxFiles} files)`}
                </p>
                {recommendedSize && (
                  <p className="text-xs text-blue-600 mt-1">Recommended: {recommendedSize}</p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  const renderFileGrid = () => {
    if (variant === 'profile' || files.length === 0) return null

    return (
      <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {files.map((file, index) => (
          <div key={index} className="relative group">
            <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
              <img
                src={URL.createObjectURL(file)}
                alt={`Preview ${index + 1}`}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-200 rounded-lg flex items-center justify-center">
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => removeFile(index)}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-1">
              <p className="text-xs text-gray-600 truncate">{file.name}</p>
              <p className="text-xs text-gray-400">{formatFileSize(file.size)}</p>
            </div>
          </div>
        ))}
      </div>
    )
  }

  const renderExistingImages = () => {
    if (existingImages.length === 0) return null

    return (
      <div className={`${files.length > 0 ? 'mt-4' : ''}`}>
        <h4 className="text-sm font-medium text-gray-700 mb-2">Current Images</h4>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {existingImages.map((imageUrl, index) => (
            <div key={index} className="relative group">
              <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                <img
                  src={imageUrl}
                  alt={`Current ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              </div>
              {onRemoveExisting && (
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-200 rounded-lg flex items-center justify-center">
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => onRemoveExisting(index)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="space-y-2">
        {description && <p className="text-sm text-gray-600">{description}</p>}
        
        {/* File count indicator */}
        {multiple && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {totalFiles} / {maxFiles} files
            </Badge>
            {recommendedSize && (
              <span className="text-xs text-gray-500">• {recommendedSize} recommended</span>
            )}
          </div>
        )}
      </div>

      <div className="mt-3">
        {renderExistingImages()}
        {renderUploadArea()}
        {renderFileGrid()}
      </div>
    </div>
  )
}