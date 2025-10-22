import React, { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './button'
import { cn } from '@/lib/utils'

interface ImageCarouselProps {
  images: string[]
  alt: string
  className?: string
  showThumbnails?: boolean
  autoplay?: boolean
  autoplayInterval?: number
  hoverToPlay?: boolean
  showImageCount?: boolean
  enableKeyboardNav?: boolean
}

export function ImageCarousel({ 
  images, 
  alt, 
  className, 
  showThumbnails = false,
  autoplay = false,
  autoplayInterval = 5000,
  hoverToPlay = false,
  showImageCount = true,
  enableKeyboardNav = true
}: ImageCarouselProps) {
  // Simple filter - only remove empty/null values
  const isValidImageUrl = (url: string): boolean => {
    return !!(url && typeof url === 'string' && url.trim() !== '');
  }

  // Filter out empty/invalid images
  const validImages = images?.filter(img => 
    img && 
    typeof img === 'string' && 
    img.trim() !== '' && 
    img !== 'undefined' && 
    img !== 'null'
  ) || []


  
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isHovered, setIsHovered] = useState(false)
  const [imageLoadStates, setImageLoadStates] = useState<{[key: number]: boolean}>({})
  const [isPlaying, setIsPlaying] = useState(autoplay)

  // Auto-play functionality
  React.useEffect(() => {
    const shouldPlay = hoverToPlay ? (autoplay && isHovered) : (autoplay && isPlaying)
    if (!shouldPlay || validImages.length <= 1) return

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % validImages.length)
    }, autoplayInterval)

    return () => clearInterval(interval)
  }, [autoplay, autoplayInterval, validImages.length, hoverToPlay, isHovered, isPlaying])

  // Keyboard navigation
  React.useEffect(() => {
    if (!enableKeyboardNav) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setCurrentIndex((prev) => (prev - 1 + validImages.length) % validImages.length)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        setCurrentIndex((prev) => (prev + 1) % validImages.length)
      }
    }

    // Only add listener when the carousel is focused/hovered
    if (isHovered) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [enableKeyboardNav, validImages.length, isHovered])

  // Disable preloading to prevent infinite loops - let browser handle image loading naturally
  // React.useEffect(() => {
  //   validImages.forEach((src, index) => {
  //     if (!imageLoadStates[index] && src) {
  //       const img = new Image()
  //       img.onload = () => {
  //         setImageLoadStates(prev => ({ ...prev, [index]: true }))
  //       }
  //       img.onerror = () => {
  //         console.warn('Failed to load image:', src)
  //         // Mark as "loaded" even on error to prevent infinite loading
  //         setImageLoadStates(prev => ({ ...prev, [index]: false }))
  //       }
  //       img.src = src
  //     }
  //   })
  // }, [validImages, imageLoadStates])

  const goToPrevious = (e: React.MouseEvent) => {
    e.stopPropagation()
    setCurrentIndex((prev) => (prev - 1 + validImages.length) % validImages.length)
  }

  const goToNext = (e: React.MouseEvent) => {
    e.stopPropagation()
    setCurrentIndex((prev) => (prev + 1) % validImages.length)
  }

  const goToSlide = (index: number, e: React.MouseEvent) => {
    e.stopPropagation()
    setCurrentIndex(index)
  }

  // Handle empty or invalid image arrays
  if (!validImages || validImages.length === 0) {
    return (
      <div className="relative bg-gray-50 flex items-center justify-center h-full w-full">
        <div className="text-center p-6">
          <div className="w-16 h-16 mx-auto mb-3 text-gray-300">
            <svg fill="currentColor" viewBox="0 0 24 24" className="w-full h-full">
              <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
            </svg>
          </div>
          <p className="text-sm text-gray-400">No image available</p>
        </div>
      </div>
    )
  }

  const currentImage = validImages[currentIndex]

  return (
    <div 
      className={cn("relative group", className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      tabIndex={enableKeyboardNav ? 0 : -1}
    >
      {/* Main Image */}
      <div className="relative overflow-hidden bg-gray-100">
        <img 
          src={currentImage} 
          alt={`${alt} - Image ${currentIndex + 1}`}
          className={cn(
            "w-full h-full object-cover transition-all duration-500",
            isHovered ? "scale-105" : "scale-100"
          )}
        />
        
        {/* Removed loading indicator since we're not preloading */}
        
        {/* Navigation Arrows - Only show if multiple images */}
        {validImages.length > 1 && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white/90 opacity-0 group-hover:opacity-100 transition-opacity duration-200 h-8 w-8 shadow-md"
              onClick={goToPrevious}
              aria-label="Previous image"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white/90 opacity-0 group-hover:opacity-100 transition-opacity duration-200 h-8 w-8 shadow-md"
              onClick={goToNext}
              aria-label="Next image"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </>
        )}

        {/* Image Counter */}
        {validImages.length > 1 && showImageCount && (
          <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded-full backdrop-blur-sm transition-opacity duration-200">
            {currentIndex + 1} / {validImages.length}
          </div>
        )}

        {/* Multiple Images Indicator */}
        {validImages.length > 1 && !showImageCount && (
          <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded-full backdrop-blur-sm flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22 16V7c0-1.1-.9-2-2-2H9c-1.1 0-2 .9-2 2v9c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2zm-10.6-3.47l1.63 2.18 2.58-3.22c.2-.25.58-.25.78 0l2.96 3.7c.26.33.03.81-.39.81H9.5c-.42 0-.65-.48-.39-.81l1.29-1.66z"/>
              <path d="M2 7v12c0 1.1.9 2 2 2h12v-2H4V7H2z"/>
            </svg>
            <span>{validImages.length}</span>
          </div>
        )}

        {/* Dot Indicators */}
        {validImages.length > 1 && validImages.length <= 5 && !showThumbnails && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
            {validImages.map((_, index) => (
              <button
                key={index}
                onClick={(e) => goToSlide(index, e)}
                className={cn(
                  "w-2 h-2 rounded-full transition-all duration-200",
                  currentIndex === index 
                    ? "bg-white scale-110" 
                    : "bg-white/50 hover:bg-white/75"
                )}
                aria-label={`Go to image ${index + 1}`}
              />
            ))}
          </div>
        )}

        {/* Thumbnail Strip */}
        {showThumbnails && validImages.length > 1 && (
          <div className="absolute bottom-2 left-2 right-2 flex gap-1 overflow-x-auto scrollbar-hide">
            {validImages.slice(0, 6).map((image, index) => (
              <button
                key={index}
                onClick={(e) => goToSlide(index, e)}
                className={cn(
                  "flex-shrink-0 w-12 h-8 rounded border-2 overflow-hidden transition-all duration-200",
                  currentIndex === index 
                    ? "border-white shadow-lg" 
                    : "border-white/50 hover:border-white/75"
                )}
              >
                <img 
                  src={image} 
                  alt={`${alt} thumbnail ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
            {validImages.length > 6 && (
              <div className="flex-shrink-0 w-12 h-8 rounded border-2 border-white/50 bg-black/50 flex items-center justify-center text-white text-xs">
                +{validImages.length - 6}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default ImageCarousel