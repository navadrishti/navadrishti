import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { CAReviewDocument } from '@/lib/ca-review-types'
import { DocumentFileViewer } from './document-file-viewer'

export function DocumentsCard({ documents }: { documents: CAReviewDocument[] }) {
  const [viewing, setViewing] = useState<CAReviewDocument | null>(null)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-baseline gap-2 text-lg">
          Documents
          {documents.length > 0 ? (
            <span className="text-sm font-normal text-slate-400">{documents.length}</span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {documents.length === 0 ? (
          <p className="text-sm text-slate-500">No documents uploaded.</p>
        ) : viewing ? (
          <DocumentFileViewer
            url={viewing.file_url}
            label={viewing.label}
            fileName={viewing.file_name}
            onBack={() => setViewing(null)}
          />
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200">
            {documents.map((doc) => (
              <button
                key={doc.id}
                type="button"
                onClick={() => setViewing(doc)}
                className="flex w-full items-center justify-between gap-4 border-b border-slate-200 px-4 py-3 text-left last:border-b-0"
              >
                <span className="truncate text-sm font-medium text-slate-900">{doc.label}</span>
                <span className="inline-flex h-9 shrink-0 items-center rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-udaan-blue">
                  View
                </span>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
