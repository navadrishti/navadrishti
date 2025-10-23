'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CarouselImage {
  src: string;
  alt: string;
  title?: string;
  description?: string;
}

interface HeroCarouselProps {
  images: CarouselImage[];
  autoPlayInterval?: number;
  showIndicators?: boolean;
  showNavigation?: boolean;
}

export function HeroCarousel({ 
  images, 
  autoPlayInterval = 5000, 
  showIndicators = true, 
  showNavigation = true 
}: HeroCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());

  // Auto-play functionality
  useEffect(() => {
    if (!isAutoPlaying || images.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => 
        prevIndex === images.length - 1 ? 0 : prevIndex + 1
      );
    }, autoPlayInterval);

    return () => clearInterval(interval);
  }, [currentIndex, isAutoPlaying, images.length, autoPlayInterval]);

  const goToPrevious = () => {
    setIsAutoPlaying(false);
    setCurrentIndex(currentIndex === 0 ? images.length - 1 : currentIndex - 1);
    setTimeout(() => setIsAutoPlaying(true), 3000); // Resume auto-play after 3 seconds
  };

  const goToNext = () => {
    setIsAutoPlaying(false);
    setCurrentIndex(currentIndex === images.length - 1 ? 0 : currentIndex + 1);
    setTimeout(() => setIsAutoPlaying(true), 3000); // Resume auto-play after 3 seconds
  };

  const goToSlide = (index: number) => {
    setIsAutoPlaying(false);
    setCurrentIndex(index);
    setTimeout(() => setIsAutoPlaying(true), 3000); // Resume auto-play after 3 seconds
  };

  const handleImageError = (index: number) => {
    setImageErrors(prev => new Set([...prev, index]));
  };

  const handleImageLoad = (index: number) => {
    setImageErrors(prev => {
      const newSet = new Set(prev);
      newSet.delete(index);
      return newSet;
    });
  };

  if (images.length === 0) {
    return (
      <div className="w-full h-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center">
        <p className="text-blue-600 text-lg">No images available</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden rounded-lg">
      {/* Main Image Container */}
      <div className="relative w-full h-full">
        {images.map((image, index) => (
          <div
            key={index}
            className={`absolute inset-0 transition-opacity duration-500 ease-in-out ${
              index === currentIndex ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {imageErrors.has(index) ? (
              <div className="w-full h-full bg-gradient-to-br from-blue-100 via-blue-200 to-blue-300 flex items-center justify-center">
                <div className="text-center text-blue-600">
                  <div className="text-4xl mb-2">🖼️</div>
                  <p className="text-lg font-medium">Image Loading...</p>
                  <p className="text-sm opacity-75">Please wait</p>
                </div>
              </div>
            ) : (
              <Image
                src={image.src}
                alt={image.alt}
                fill
                className="object-cover"
                priority={index === 0}
                sizes="(max-width: 768px) 100vw, 50vw"
                onError={() => handleImageError(index)}
                onLoad={() => handleImageLoad(index)}
              />
            )}
            {/* Overlay for better text readability */}
            <div className="absolute inset-0 bg-black/20" />
            
            {/* Image Title and Description */}
            {(image.title || image.description) && (
              <div className="absolute bottom-6 left-6 right-6 text-white">
                {image.title && (
                  <h3 className="text-xl font-semibold mb-2">{image.title}</h3>
                )}
                {image.description && (
                  <p className="text-sm opacity-90">{image.description}</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Navigation Arrows */}
      {showNavigation && images.length > 1 && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/30 text-white border-white/20"
            onClick={goToPrevious}
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/30 text-white border-white/20"
            onClick={goToNext}
          >
            <ChevronRight className="h-6 w-6" />
          </Button>
        </>
      )}

      {/* Indicators */}
      {showIndicators && images.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex space-x-2">
          {images.map((_, index) => (
            <button
              key={index}
              className={`w-2 h-2 rounded-full transition-all duration-200 ${
                index === currentIndex 
                  ? 'bg-white scale-125' 
                  : 'bg-white/50 hover:bg-white/70'
              }`}
              onClick={() => goToSlide(index)}
            />
          ))}
        </div>
      )}

    </div>
  );
}