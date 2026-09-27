"use client"

import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type AuthBackButtonProps = {
  fallbackHref?: string
  className?: string
  variant?: 'link' | 'button'
}

export function AuthBackButton({
  fallbackHref = '/',
  className,
  variant = 'link',
}: AuthBackButtonProps) {
  const router = useRouter()

  const handleBack = () => {
    if (typeof window !== 'undefined') {
      const referrer = document.referrer
      const hasSameOriginReferrer =
        referrer.length > 0 && new URL(referrer).origin === window.location.origin

      if (hasSameOriginReferrer || window.history.length > 1) {
        router.back()
        return
      }
    }

    router.push(fallbackHref)
  }

  if (variant === 'link') {
    return (
      <button
        type="button"
        onClick={handleBack}
        className={cn(
          'inline-flex items-center text-sm font-medium text-primary hover:underline',
          className
        )}
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        Back
      </button>
    )
  }

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={handleBack}
      className={cn(
        'px-0 text-primary hover:text-primary/80 hover:bg-transparent active:bg-transparent focus-visible:bg-transparent focus-visible:ring-0',
        className
      )}
    >
      <ArrowLeft className="mr-2 h-4 w-4" />
      Back
    </Button>
  )
}

export function AuthCardBackRow({
  fallbackHref,
}: Pick<AuthBackButtonProps, 'fallbackHref'>) {
  return (
    <div className="text-sm">
      <AuthBackButton fallbackHref={fallbackHref} />
    </div>
  )
}
