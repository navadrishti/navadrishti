import type { ReactNode } from 'react'
import Link from 'next/link'
import { XCircle, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

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
        ) : isUnverified ? (
          <div className="space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Account verification required to apply for offers.
              </AlertDescription>
            </Alert>

            <div className="p-4 bg-amber-50 border border-amber-200 rounded-md">
              <div className="flex items-start gap-3">
                <div className="text-amber-600"></div>
                <div>
                  <p className="text-amber-800 font-medium text-sm">Verification Required</p>
                  <p className="text-amber-700 text-sm mt-1">
                    You need to complete identity verification (Aadhaar & PAN) before you can apply to service offers.
                    <Link href="/verification" className="underline font-medium ml-1 hover:text-amber-900">
                      Complete verification now
                    </Link>
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : existingApplication ? (
          existingApplication
        ) : (
          <div className="space-y-4">
            {needSelectionForm}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
