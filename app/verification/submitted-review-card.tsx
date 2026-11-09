import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function SubmittedReviewCard({
  title,
  description,
  remainVerified = false,
  onBack,
}: {
  title: string
  description: string
  remainVerified?: boolean
  onBack: () => void
}) {
  return (
    <div id="verification-top" className="mx-auto max-w-4xl space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="border-green-200 bg-green-50">
            <AlertDescription className="text-green-800">
              A CA will review your documents. Any feedback from that review will be shown here.
              {remainVerified ? ' You remain verified while this review is in progress.' : ''}
            </AlertDescription>
          </Alert>
          <Button onClick={onBack}>Back to Dashboard</Button>
        </CardContent>
      </Card>
    </div>
  )
}
