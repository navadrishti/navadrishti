import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { CAFieldComparison, CAReviewDocument } from '@/lib/ca-review-types'
import { comparedDocumentNames, comparisonResult, sourceEmptyLabel } from './helpers'
import { ExpiryLines } from './review-fields'

function ComparisonRow({ row, documents }: { row: CAFieldComparison; documents: CAReviewDocument[] }) {
  const result = comparisonResult(row)
  const sources = Array.isArray(row.sources) ? row.sources : []
  const comparedNames = comparedDocumentNames(row, documents)

  return (
    <div className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
      <p className="text-sm font-medium">{row.field}</p>
      <p className="text-sm text-slate-600">
        Compared: {comparedNames.join(', ')}
      </p>
      {sources.map((source) => (
        <p
          key={`${row.field}-${source.origin}-${source.document}`}
          className={`text-sm ${source.deviation ? 'text-red-700' : 'text-slate-600'}`}
        >
          {source.origin === 'input' ? 'Form input' : source.document}:{' '}
          {source.value.trim() || sourceEmptyLabel(source)}
          {source.deviation ? ' — mismatch' : ''}
        </p>
      ))}
      <p className={`text-sm ${result.className}`}>
        Result: {result.text}
      </p>
      {/expiry/i.test(row.field) ? (
        <div className="mt-1">
          <ExpiryLines
            value={
              sources.find((source) => source.origin === 'document' && source.value.trim())?.value ||
              sources.find((source) => source.origin === 'input' && source.value.trim())?.value
            }
          />
        </div>
      ) : null}
    </div>
  )
}

export function ComparisonCard({
  comparisons,
  documents,
  ocrLoading,
}: {
  comparisons: CAFieldComparison[]
  documents: CAReviewDocument[]
  ocrLoading: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Comparison across documents</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {ocrLoading ? (
          <p className="text-sm text-slate-500">Comparing form input with document fields...</p>
        ) : comparisons.length === 0 ? (
          <p className="text-sm text-slate-500">No shared fields to compare yet.</p>
        ) : (
          comparisons.map((row) => <ComparisonRow key={row.field} row={row} documents={documents} />)
        )}
      </CardContent>
    </Card>
  )
}
