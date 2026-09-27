import type { FormEvent, ReactNode } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AuthCardBackRow } from '@/components/header'

type RegistrationCardProps = {
  title: string
  description: string
  error: string | null
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
  submitDisabled: boolean
  isSubmitting: boolean
  submitLabel: string
  submittingLabel: string
  children: ReactNode
}

export function RegistrationCard({
  title,
  description,
  error,
  onSubmit,
  submitDisabled,
  isSubmitting,
  submitLabel,
  submittingLabel,
  children,
}: RegistrationCardProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-[#F6F5F1] to-[#FFF6ED] p-4">
      <Card className="w-full max-w-2xl shadow-none">
        <CardHeader className="space-y-1">
          <AuthCardBackRow fallbackHref="/register" />
          <CardTitle className="text-2xl font-bold text-center">{title}</CardTitle>
          <CardDescription className="text-center">
            {description}
          </CardDescription>
        </CardHeader>

        <form onSubmit={onSubmit}>
          <CardContent className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {children}

            <div className="flex flex-col space-y-4">
              <Button type="submit" className="w-full" disabled={submitDisabled}>
                {isSubmitting ? submittingLabel : submitLabel}
              </Button>

              <div className="text-center text-sm">
                Already have an account?{' '}
                <Link href="/login" className="font-medium text-primary hover:underline">
                  Sign in
                </Link>
              </div>
            </div>
          </CardContent>
        </form>
      </Card>
    </div>
  )
}
