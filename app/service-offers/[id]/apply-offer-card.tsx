import type { ReactNode } from 'react'
import Link from 'next/link'
import { XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { VerificationRequiredNotice } from '@/components/verification-required-notice'

interface ApplyOfferCardProps {
  isAuthenticated: boolean
  canApplyToOffer: boolean
  isUnverified: boolean
  existingApplication: ReactNode
  needSelectionForm: ReactNode
}

export function ApplyOfferCard({
  isAuthenticated,
  canApplyToOffer,
  isUnverified,
  existingApplication,
  needSelectionForm
}: ApplyOfferCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Apply for Offer
        </CardTitle>
      </CardHeader>

      <CardContent>
        {!isAuthenticated ? (
          <div className="text-center space-y-4">
            <p className="text-muted-foreground">You need to be logged in to apply for this offer.</p>
            <Button asChild className="w-full">
              <Link href="/login">Log In</Link>
            </Button>
          </div>
        ) : !canApplyToOffer ? (
          <Alert>
            <XCircle className="h-4 w-4" />
            <AlertDescription>
              Offer owners cannot apply to their own capability listing.
            </AlertDescription>
          </Alert>
        ) : existingApplication ? (
          existingApplication
        ) : isUnverified ? (
          <VerificationRequiredNotice description="Complete identity verification (Aadhaar and PAN) before you can apply to service offers." />
        ) : (
          <div className="space-y-4">
            {needSelectionForm}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
