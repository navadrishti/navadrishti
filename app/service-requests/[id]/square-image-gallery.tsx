'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function SquareImageGallery({
  images,
  alt,
  thumbClassName = 'h-20 w-20',
}: {
  images: string[]
  alt: string
  thumbClassName?: string
}) {
  const validImages = images.filter((url) => typeof url === 'string' && url.trim())
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  if (validImages.length === 0) return null

  const openAt = (index: number) => {
    setActiveIndex(index)
    setOpen(true)
  }

  const showPrevious = () => {
    setActiveIndex((current) => (current - 1 + validImages.length) % validImages.length)
  }

  const showNext = () => {
    setActiveIndex((current) => (current + 1) % validImages.length)
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {validImages.map((url, index) => (
          <button
            key={`${url}-${index}`}
            type="button"
            onClick={() => openAt(index)}
            className={cn(
              'overflow-hidden rounded-md border border-slate-200 bg-slate-100 transition hover:border-udaan-blue/40 hover:ring-2 hover:ring-udaan-blue/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-udaan-blue/40',
              thumbClassName
            )}
            aria-label={`View image ${index + 1} for ${alt}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- listing images are user-supplied URLs from arbitrary hosts */}
            <img src={url} alt={`${alt} thumbnail ${index + 1}`} className="h-full w-full object-cover" />
          </button>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl border-none bg-transparent p-0 shadow-none [&>button]:text-white [&>button]:hover:bg-white/10">
          <div className="relative overflow-hidden rounded-lg bg-black/90">
            <div className="flex min-h-[50vh] items-center justify-center p-4 sm:p-8">
              {/* eslint-disable-next-line @next/next/no-img-element -- listing images are user-supplied URLs from arbitrary hosts */}
              <img
                src={validImages[activeIndex]}
                alt={`${alt} - image ${activeIndex + 1}`}
                className="max-h-[75vh] max-w-full object-contain"
              />
            </div>

            {validImages.length > 1 ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute left-2 top-1/2 h-9 w-9 -translate-y-1/2 text-white hover:bg-white/10"
                  onClick={showPrevious}
                  aria-label="Previous image"
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-1/2 h-9 w-9 -translate-y-1/2 text-white hover:bg-white/10"
                  onClick={showNext}
                  aria-label="Next image"
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
                  {activeIndex + 1} / {validImages.length}
                </div>
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
