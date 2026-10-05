import Link from 'next/link'
import { ArrowLeft, Home } from 'lucide-react'
import { Header } from '@/components/header'
import { ProductBrand } from '@/components/product-brand'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#f7f8f5]">
      <Header />

      <main className="relative flex min-h-[calc(100vh-1rem)] items-center justify-center overflow-hidden px-5 py-16 sm:px-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-32 top-16 h-72 w-72 rounded-full bg-[#f47b20]/10 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 bottom-8 h-80 w-80 rounded-full bg-[#2b3e41]/10 blur-3xl"
        />

        <div className="relative w-full max-w-2xl text-center">
          <ProductBrand
            href="/"
            size="sm"
            className="mx-auto text-[#2b3e41]"
            nameClassName="text-[#2b3e41]"
            poweredClassName="text-[#2b3e41]/60"
          />

          <p className="mt-12 text-7xl font-bold tracking-[-0.08em] text-[#2b3e41] sm:text-8xl">
            404
          </p>

          <h1 className="mt-3 text-3xl font-bold tracking-tight text-[#2b3e41] sm:text-5xl">
            This page took a wrong turn.
          </h1>
          <p className="mx-auto mt-5 max-w-lg text-base leading-7 text-[#2b3e41]/70 sm:text-lg">
            The page you are looking for may have moved, expired, or never existed. Let&apos;s
            get you back to the work that matters.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/">
                <Home aria-hidden="true" />
                Go to home
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
              <Link href="/service-requests">
                Explore opportunities
                <ArrowLeft aria-hidden="true" className="rotate-180" />
              </Link>
            </Button>
          </div>

          <p className="mt-12 text-sm text-[#2b3e41]/55">
            Need help?{' '}
            <Link href="/help-support" className="font-semibold text-[#2b3e41] underline-offset-4 hover:underline">
              Visit support
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
