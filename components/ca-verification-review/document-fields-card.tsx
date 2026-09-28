import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { certificateExpiryCopy } from '@/lib/auth'
import type { CAReviewDocument } from '@/lib/ca-review-types'
import { isExpiryOcrLabel } from './helpers'

function DocumentOcrFields({ doc }: { doc: CAReviewDocument }) {
  if (doc.ocr_fields.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        {doc.ocr_status === 'failed' ? 'Could not read this document.' : 'No fields found on this document.'}
      </p>
    )
  }

  return (
    <>
      {doc.ocr_fields.map((field) => {
        const expiryCopy = isExpiryOcrLabel(field.label)
          ? certificateExpiryCopy(field.value)
          : null
        return (
          <div key={field.label}>
            <p className="text-sm text-slate-600">
              {field.label}: {field.value}
            </p>
            {expiryCopy?.expiry_label ? (
              <>
                <p className="text-sm text-slate-600">Expiry date: {expiryCopy.expiry_label}</p>
                <p className="text-sm text-slate-600">Days remaining: {expiryCopy.days_line}</p>
              </>
            ) : null}
          </div>
        )
      })}
    </>
  )
}

export function DocumentFieldsCard({
  documents,
  ocrLoading,
  ocrError,
}: {
  documents: CAReviewDocument[]
  ocrLoading: boolean
  ocrError?: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Document fields</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {ocrLoading ? (
          <p className="text-sm text-slate-500">Reading uploaded documents...</p>
        ) : ocrError ? (
          <p className="text-sm text-slate-500">{ocrError}</p>
        ) : null}
        {!ocrLoading && documents.map((doc) => (
          <div key={`${doc.id}-ocr`}>
            <p className="text-sm font-medium mb-2">{doc.label}</p>
            <div className="space-y-1">
              <DocumentOcrFields doc={doc} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
