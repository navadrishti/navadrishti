'use client'

import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { certificateExpiryCopy } from '@/lib/auth'
import { ComplianceBadge, type ComplianceBadgeKind } from '@/components/verification-badge'

type CAReviewDocument = {
  label: string
  url?: string
  file_name?: string
}

type CAFieldComparison = {
  label?: string
  status?: 'match' | 'mismatch' | 'incomplete'
  match?: boolean
  deviations?: string[]
  sources?: { origin?: string; document?: string; value?: string }[]
  input_value?: string
  document_value?: string
}

function complianceTagBadgeKind(key: string): ComplianceBadgeKind | null {
  if (key === 'twelve_a' || key === 'eighty_g' || key === 'csr1' || key === 'fcra') return key
  return null
}

function isDocumentImageUrl(url: string, fileName = '') {
  return (
    /\.(png|jpe?g|webp|gif)$/i.test(url) ||
    /\.(png|jpe?g|webp|gif)$/i.test(fileName) ||
    url.includes('/image/upload')
  )
}

function isDocumentPdfUrl(url: string, fileName = '') {
  return /pdf/i.test(url) || /\.pdf$/i.test(fileName) || url.includes('/raw/upload')
}

function DocumentPreview({
  src,
  alt,
  isImage,
}: {
  src: string
  alt: string
  isImage: boolean
}) {
  const [scale, setScale] = useState(1)
  const scaleRef = useRef(1)
  const frameRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scaleRef.current = scale
  }, [scale])

  useEffect(() => {
    setScale(1)
  }, [src])

  useEffect(() => {
    const el = frameRef.current
    if (!el) return

    let startDistance = 0
    let startScale = 1

    const distance = (touches: TouchList) =>
      Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY
      )

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 2) {
        startDistance = distance(event.touches)
        startScale = scaleRef.current
      }
    }

    const onTouchMove = (event: TouchEvent) => {
      event.stopPropagation()
      if (event.touches.length === 2 && startDistance > 0) {
        event.preventDefault()
        const next = Math.min(4, Math.max(1, startScale * (distance(event.touches) / startDistance)))
        setScale(next)
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
    }
  }, [])

  return (
    <div
      ref={frameRef}
      className="h-[70vh] overflow-auto overscroll-contain rounded-lg border border-slate-200 bg-slate-50"
      style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x pan-y' }}
      onWheel={(event) => event.stopPropagation()}
      onTouchMove={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {isImage ? (
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="block h-auto max-w-none select-none"
          style={{ width: `${scale * 100}%` }}
        />
      ) : (
        <iframe
          title={alt}
          src={src}
          className="block border-0"
          style={{ width: `${scale * 100}%`, height: `${Math.max(140, scale * 140)}vh` }}
        />
      )}
    </div>
  )
}

export function DocumentFileViewer({
  url,
  label,
  fileName,
  onBack,
}: {
  url: string
  label: string
  fileName?: string
  onBack?: () => void
}) {
  const isImage = isDocumentImageUrl(url, fileName)
  const isPdf = isDocumentPdfUrl(url, fileName)
  const [previewUrl, setPreviewUrl] = useState<string | null>(isImage ? url : null)

  useEffect(() => {
    if (isImage) {
      setPreviewUrl(url)
      return
    }

    let cancelled = false
    let objectUrl: string | null = null

    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error('Failed to load document')
        return response.blob()
      })
      .then((blob) => {
        if (cancelled) return
        const typed = isPdf ? new Blob([blob], { type: 'application/pdf' }) : blob
        objectUrl = URL.createObjectURL(typed)
        setPreviewUrl(objectUrl)
      })
      .catch(() => {
        if (!cancelled) setPreviewUrl(url)
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [url, isImage, isPdf])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-sm font-medium text-slate-900">{label}</p>
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="shrink-0 text-xs font-medium text-udaan-blue"
          >
            Back
          </button>
        ) : null}
      </div>
      {previewUrl ? (
        <DocumentPreview src={previewUrl} alt={label} isImage={isImage} />
      ) : (
        <p className="p-6 text-sm text-slate-500">Opening document...</p>
      )}
    </div>
  )
}

function entityLabel(type: 'individuals' | 'companies' | 'ngos') {
  if (type === 'companies') return 'company'
  if (type === 'ngos') return 'NGO'
  return 'individual'
}

export function caReviewDescription(type: 'individuals' | 'companies' | 'ngos') {
  return `Review and verify this ${entityLabel(type)}'s details`
}

export function isCaReviewLocked(item: Record<string, unknown> | null | undefined) {
  return (
    String(item?.verification_status || '').toLowerCase() === 'verified' &&
    !item?.reverification_pending
  )
}

function comparisonResult(row: CAFieldComparison) {
  if (row.status === 'match' || row.match) return { text: 'Match', className: 'text-green-700' }
  if (row.status === 'incomplete') return { text: 'Incomplete', className: 'text-slate-600' }
  const where = Array.isArray(row.deviations) && row.deviations.length > 0
    ? ` in ${row.deviations.join(', ')}`
    : ''
  return { text: `Mismatch${where}`, className: 'text-red-700' }
}

function sourceEmptyLabel(source: { origin?: string }) {
  return source.origin === 'input' ? 'Not set' : 'Not found on document'
}

function comparedDocumentNames(row: CAFieldComparison, fallbackDocs: CAReviewDocument[]) {
  const sources = Array.isArray(row.sources) ? row.sources : []
  const names = sources.map((source) => source.document).filter(Boolean)
  if (names.length > 0) return names
  return fallbackDocs.map((doc) => doc.label).filter(Boolean)
}

function ReviewField({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      <p className="text-sm text-slate-600">{value || 'Not set'}</p>
    </div>
  )
}

function ExpiryLines({ value }: { value?: string }) {
  const copy = certificateExpiryCopy(value)
  if (!copy.expiry_label) {
    return <p className="text-sm text-slate-600">Not set</p>
  }
  return (
    <>
      <p className="text-sm text-slate-600">Expiry date: {copy.expiry_label}</p>
      <p className="text-sm text-slate-600">Days remaining: {copy.days_line}</p>
    </>
  )
}

function ExpiryReviewField({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      <ExpiryLines value={value} />
    </div>
  )
}

function isExpiryOcrLabel(label: string) {
  return /expir|valid until|valid till|valid upto|validity/i.test(label)
}

export function CAVerificationReview({
  item,
  type,
  ocrLoading = false,
  complianceTags,
  onComplianceTagsChange,
  readOnly = false,
}: {
  item: any
  type: 'individuals' | 'companies' | 'ngos'
  ocrLoading?: boolean
  complianceTags?: string[]
  onComplianceTagsChange?: (tags: string[]) => void
  readOnly?: boolean
}) {
  const documents: CAReviewDocument[] = Array.isArray(item.documents) ? item.documents : []
  const comparisons: CAFieldComparison[] = Array.isArray(item.field_comparisons)
    ? item.field_comparisons
    : []
  const [viewing, setViewing] = useState<CAReviewDocument | null>(null)

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Basic Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {type === 'individuals' && (
              <>
                <ReviewField label="Full Name" value={item.name} />
                <ReviewField label="Aadhaar Number" value={item.aadhaar} />
                <ReviewField label="PAN Number" value={item.pan} />
                <ReviewField label="Email" value={item.email} />
                <ReviewField label="Phone" value={item.phone} />
              </>
            )}
            {type === 'companies' && (
              <>
                <ReviewField label="Company Name" value={item.company_name} />
                <ReviewField label="GST Number" value={item.gst} />
                <ReviewField label="PAN Number" value={item.pan} />
                <ReviewField label="CIN" value={item.cin} />
                <ReviewField label="Email" value={item.email} />
                <ReviewField label="Phone" value={item.phone} />
              </>
            )}
            {type === 'ngos' && (
              <>
                <ReviewField label="NGO Name" value={item.ngo_name} />
                <ReviewField label="Registration Number" value={item.registration_number} />
                <ReviewField label="FCRA Number" value={item.fcra_number} />
                <ExpiryReviewField label="FCRA Expiry" value={item.fcra_expiry} />
                <ReviewField label="PAN Number" value={item.pan} />
                <ReviewField label="12A Number" value={item.twelve_a} />
                <ExpiryReviewField label="12A Expiry" value={item.twelve_a_expiry} />
                <ReviewField label="80G Number" value={item.eighty_g} />
                <ExpiryReviewField label="80G Expiry" value={item.eighty_g_expiry} />
                <ReviewField label="CSR-1 Registration Number" value={item.csr1} />
                <ExpiryReviewField label="CSR-1 Expiry" value={item.csr1_expiry} />
                <ReviewField label="Email" value={item.email} />
                <ReviewField label="Phone" value={item.phone} />
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {type === 'ngos' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Allot compliance tags</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-600">
              {readOnly
                ? 'Tags allotted at verification. These cannot be changed.'
                : item.reverification_pending
                  ? 'Tick tags for updated certificates that are present and not expired. CSR funding requires CSR-1.'
                  : 'Tick tags for certificates that are present and not expired. CSR funding requires CSR-1.'}
            </p>
            {(Array.isArray(item.compliance_tag_options) ? item.compliance_tag_options : []).map((option: {
              key: string
              label: string
              eligible: boolean
              reason: string
            }) => {
              const selected = Array.isArray(complianceTags) && complianceTags.includes(option.key)
              const expiryCopy = certificateExpiryCopy(option.expiry)
              const badgeKind = complianceTagBadgeKind(option.key)
              return (
                <label
                  key={option.key}
                  className={`flex items-start gap-3 ${option.eligible || readOnly ? '' : 'opacity-60'}`}
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={readOnly ? selected : option.eligible && selected}
                    disabled={readOnly || !option.eligible || ocrLoading}
                    onCheckedChange={(checked) => {
                      if (readOnly || !option.eligible || !onComplianceTagsChange) return
                      const current = Array.isArray(complianceTags) ? complianceTags : []
                      onComplianceTagsChange(
                        checked === true
                          ? Array.from(new Set([...current, option.key]))
                          : current.filter((key) => key !== option.key)
                      )
                    }}
                  />
                  <span>
                    <span className="inline-flex min-w-0 items-center gap-2">
                      {badgeKind ? (
                        <ComplianceBadge kind={badgeKind} size="lg" showText={false} />
                      ) : null}
                      <span className="text-sm font-medium text-slate-900">{option.label}</span>
                    </span>
                    {expiryCopy.expiry_label ? (
                      <>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          Expiry date: {expiryCopy.expiry_label}
                        </span>
                        <span className="block text-xs text-slate-500">
                          Days remaining: {expiryCopy.days_line}
                        </span>
                      </>
                    ) : (
                      <span className="mt-0.5 block text-xs text-slate-500">{option.reason}</span>
                    )}
                  </span>
                </label>
              )
            })}
          </CardContent>
        </Card>
      ) : null}

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

      {(documents.length > 0 || ocrLoading) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Document fields</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {ocrLoading ? (
              <p className="text-sm text-slate-500">Reading uploaded documents...</p>
            ) : item.ocr_error ? (
              <p className="text-sm text-slate-500">{item.ocr_error}</p>
            ) : null}
            {!ocrLoading && documents.map((doc) => (
              <div key={`${doc.id}-ocr`}>
                <p className="text-sm font-medium mb-2">{doc.label}</p>
                <div className="space-y-1">
                  {doc.ocr_fields.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      {doc.ocr_status === 'failed' ? 'Could not read this document.' : 'No fields found on this document.'}
                    </p>
                  ) : (
                    doc.ocr_fields.map((field) => {
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
                    })
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {(documents.length > 0 || ocrLoading) && (
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
              comparisons.map((row) => {
                const result = comparisonResult(row)
                const sources = Array.isArray(row.sources) ? row.sources : []
                const comparedNames = comparedDocumentNames(row, documents)
                return (
                  <div key={row.field} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
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
              })
            )}
          </CardContent>
        </Card>
      )}
    </>
  )
}
