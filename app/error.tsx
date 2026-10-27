'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Header } from '@/components/header'
import { ProductBrand } from '@/components/product-brand'
import { Button } from '@/components/ui/button'

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Application error:', error.digest || error.name)
  }, [error])

  return (
    <div className="min-h-screen bg-[#f7f8f5]">
      <Header />
      <main className="relative flex min-h-[calc(100vh-1rem)] items-center justify-center overflow-hidden px-5 py-16 sm:px-8">
        <div className="relative w-full max-w-2xl text-center">
          <ProductBrand
            href="/"
            size="sm"
            className="mx-auto text-[#2b3e41]"
            nameClassName="text-[#2b3e41]"
            poweredClassName="text-[#2b3e41]/60"
          />
          <h1 className="mt-12 text-3xl font-bold tracking-tight text-[#2b3e41] sm:text-5xl">
            Something went wrong
          </h1>
          <p className="mx-auto mt-5 max-w-lg text-base leading-7 text-[#2b3e41]/70 sm:text-lg">
            The page could not be loaded. Try again, or return home and continue from there.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" className="w-full sm:w-auto" onClick={() => reset()}>
              Try again
            </Button>
            <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
              <Link href="/">Go to home</Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}
