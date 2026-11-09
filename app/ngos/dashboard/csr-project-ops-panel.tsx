'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { clientAuthHeaders } from '@/lib/client-session'

const EXPENSE_CATEGORIES = [
  { value: 'materials', label: 'Materials' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'outbound_logistics', label: 'Outbound logistics' },
  { value: 'return_logistics', label: 'Return logistics' },
  { value: 'other', label: 'Other' },
] as const

type Props = {
  projectId: string
  campaignId?: string | null
  disabled?: boolean
}

type ExpenseRecord = {
  id: string
  category: string
  description: string
  expense_date: string
  amount: number
  approval_status: string
  payment_status: string
  vendor_or_recipient?: string | null
  receipt_url?: string | null
  invoice_url?: string | null
  evidence_urls?: unknown
  metadata?: { review_reason?: string | null } | null
}

export function CsrProjectOpsPanel({ projectId, disabled }: Props) {
  const [tab, setTab] = useState<'expense' | 'material'>('expense')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [records, setRecords] = useState<ExpenseRecord[] | null>(null)
  const [loadingRecords, setLoadingRecords] = useState(false)
  const [recordsError, setRecordsError] = useState<string | null>(null)
  const [resubmittingId, setResubmittingId] = useState<string | null>(null)
  const [expenseImage, setExpenseImage] = useState<File | null>(null)
  const [materialImage, setMaterialImage] = useState<File | null>(null)
  const [uploadedExpenseImage, setUploadedExpenseImage] = useState('')
  const [uploadedMaterialImage, setUploadedMaterialImage] = useState('')
  const [existingEvidence, setExistingEvidence] = useState<string[]>([])
  const [fileInputKey, setFileInputKey] = useState(0)

  async function uploadImage(file: File): Promise<string> {
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type) || !file.size || file.size > 10 * 1024 * 1024) {
      throw new Error('Choose a JPG, PNG, GIF or WebP image up to 10 MB.')
    }
    const body = new FormData()
    body.append('file', file)
    const response = await fetch(`/api/csr-projects/${projectId}/attachments`, {
      method: 'POST', headers: clientAuthHeaders(), body,
    })
    const payload = await response.json()
    if (!response.ok || !payload.success || typeof payload.url !== 'string') {
      throw new Error(payload.error || 'Failed to upload image')
    }
    return payload.url
  }

  async function loadRecords() {
    setLoadingRecords(true)
    setRecordsError(null)
    try {
      const response = await fetch(`/api/csr-projects/${projectId}/expenses?mine=1`, {
        headers: clientAuthHeaders(),
      })
      const payload = await response.json()
      if (!response.ok || !payload.success || !Array.isArray(payload.data)) {
        throw new Error(payload.error || 'Failed to load submitted expenses')
      }
      setRecords(payload.data)
    } catch (error) {
      setRecordsError(error instanceof Error ? error.message : 'Failed to load submitted expenses')
    } finally {
      setLoadingRecords(false)
    }
  }

  const [expense, setExpense] = useState({
    category: 'materials',
    amount: '',
    description: '',
    expense_date: new Date().toISOString().slice(0, 10),
    vendor_or_recipient: '',
    receipt_url: '',
    invoice_url: '',
  })

  const [material, setMaterial] = useState({
    name: '',
    description: '',
    item_kind: 'consumable',
    unit: 'unit',
    required_quantity: '',
    procured_quantity: '',
    dispatched_quantity: '',
    received_quantity: '',
    consumed_quantity: '',
    damaged_quantity: '',
    missing_quantity: '',
    returned_quantity: '',
    outbound_shipment_ref: '',
    return_shipment_ref: '',
    invoice_url: '',
    unit_cost: '',
    total_cost: '',
  })

  async function submitExpense() {
    setBusy(true)
    setMessage(null)
    try {
      if (!Number.isFinite(Number(expense.amount)) || Number(expense.amount) <= 0 || !expense.description.trim()) {
        throw new Error('Enter a positive amount and a description.')
      }
      if (!expenseImage && !uploadedExpenseImage && !expense.receipt_url && !expense.invoice_url && !existingEvidence.length) {
        throw new Error('Attach a receipt or invoice image.')
      }
      const imageUrl = uploadedExpenseImage || (expenseImage ? await uploadImage(expenseImage) : '')
      if (imageUrl) setUploadedExpenseImage(imageUrl)
      const receiptUrl = imageUrl || expense.receipt_url
      const evidence = [...new Set([receiptUrl, expense.invoice_url, ...existingEvidence].filter(Boolean))]
      const url = resubmittingId
        ? `/api/csr-projects/${projectId}/expenses/${resubmittingId}/resubmit`
        : `/api/csr-projects/${projectId}/expenses`
      const res = await fetch(url, {
        method: 'POST',
        headers: clientAuthHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({
          ...expense,
          amount: Number(expense.amount),
          receipt_url: receiptUrl,
          evidence_urls: evidence,
          source_type: 'ngo_submission',
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage(json.error || 'Failed to submit expense')
        return
      }
      setMessage(resubmittingId ? 'Expense resubmitted for Evidence Verifier review.' : 'Expense submitted for Evidence Verifier review (proposed).')
      setResubmittingId(null)
      setExpenseImage(null)
      setUploadedExpenseImage('')
      setExistingEvidence([])
      setFileInputKey((key) => key + 1)
      if (records !== null) void loadRecords()
      setExpense((prev) => ({
        ...prev,
        amount: '',
        description: '',
        vendor_or_recipient: '',
        receipt_url: '',
        invoice_url: '',
      }))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to submit expense')
    } finally {
      setBusy(false)
    }
  }

  async function submitMaterial() {
    setBusy(true)
    setMessage(null)
    try {
      if (!material.name.trim()) throw new Error('Enter a material or equipment name.')
      const imageUrl = uploadedMaterialImage || (materialImage ? await uploadImage(materialImage) : '')
      if (imageUrl) setUploadedMaterialImage(imageUrl)
      const res = await fetch(`/api/csr-projects/${projectId}/materials`, {
        method: 'POST',
        headers: clientAuthHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({
          ...material,
          required_quantity: material.required_quantity || 0,
          procured_quantity: material.procured_quantity || 0,
          dispatched_quantity: material.dispatched_quantity || 0,
          received_quantity: material.received_quantity || 0,
          consumed_quantity: material.consumed_quantity || 0,
          damaged_quantity: material.damaged_quantity || 0,
          missing_quantity: material.missing_quantity || 0,
          returned_quantity: material.returned_quantity || 0,
          unit_cost: material.unit_cost || null,
          total_cost: material.total_cost || null,
          invoice_url: imageUrl || material.invoice_url || null,
          evidence_urls: [imageUrl || material.invoice_url].filter(Boolean),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage(json.error || 'Failed to submit material record')
        return
      }
      setMessage(
        'Material record submitted. Add an expense separately if you have procurement cost.'
      )
      setMaterialImage(null)
      setUploadedMaterialImage('')
      setFileInputKey((key) => key + 1)
      setMaterial((prev) => ({
        ...prev,
        name: '',
        description: '',
        required_quantity: '',
        procured_quantity: '',
        dispatched_quantity: '',
        received_quantity: '',
        consumed_quantity: '',
        damaged_quantity: '',
        missing_quantity: '',
        returned_quantity: '',
        outbound_shipment_ref: '',
        return_shipment_ref: '',
        invoice_url: '',
        unit_cost: '',
        total_cost: '',
      }))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to submit material record')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3 rounded-md border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-slate-900">Project expenses & materials</p>
          <p className="text-xs text-muted-foreground">
            Submit actual expenses before and throughout the project as they occur. This is a reminder, not a workflow block.
            The Evidence Verifier reviews each submission; approved expenses count toward expenditure and remaining budget.
            Milestone evidence stays in the GRAM App.
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant={tab === 'expense' ? 'default' : 'outline'}
            onClick={() => setTab('expense')}
            disabled={disabled || busy}
          >
            Expense
          </Button>
          <Button
            type="button"
            size="sm"
            variant={tab === 'material' ? 'default' : 'outline'}
            onClick={() => setTab('material')}
            disabled={disabled || busy}
          >
            Material
          </Button>
        </div>
      </div>

      {tab === 'expense' ? (
        <div className="grid gap-2 md:grid-cols-2">
          {resubmittingId ? (
            <div className="md:col-span-2 text-sm">
              Correct this expense, then resubmit it for review.
              <Button type="button" variant="outline" size="sm" className="ml-2" onClick={() => {
                setResubmittingId(null)
                setExpenseImage(null)
                setUploadedExpenseImage('')
                setExistingEvidence([])
                setFileInputKey((key) => key + 1)
                setExpense({ category: 'materials', amount: '', description: '', expense_date: new Date().toISOString().slice(0, 10), vendor_or_recipient: '', receipt_url: '', invoice_url: '' })
              }} disabled={busy}>
                Cancel resubmission
              </Button>
            </div>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor={`exp-cat-${projectId}`}>Category</Label>
            <select
              id={`exp-cat-${projectId}`}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={expense.category}
              onChange={(e) => setExpense((p) => ({ ...p, category: e.target.value }))}
              disabled={disabled || busy}
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`exp-amt-${projectId}`}>Amount (INR)</Label>
            <Input
              id={`exp-amt-${projectId}`}
              type="number"
              min="0"
              step="0.01"
              value={expense.amount}
              onChange={(e) => setExpense((p) => ({ ...p, amount: e.target.value }))}
              disabled={disabled || busy}
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor={`exp-desc-${projectId}`}>Description</Label>
            <Textarea
              id={`exp-desc-${projectId}`}
              value={expense.description}
              onChange={(e) => setExpense((p) => ({ ...p, description: e.target.value }))}
              disabled={disabled || busy}
              rows={2}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`exp-date-${projectId}`}>Expense date</Label>
            <Input
              id={`exp-date-${projectId}`}
              type="date"
              value={expense.expense_date}
              onChange={(e) => setExpense((p) => ({ ...p, expense_date: e.target.value }))}
              disabled={disabled || busy}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`exp-vendor-${projectId}`}>Vendor / payee (optional)</Label>
            <Input
              id={`exp-vendor-${projectId}`}
              value={expense.vendor_or_recipient}
              onChange={(e) => setExpense((p) => ({ ...p, vendor_or_recipient: e.target.value }))}
              disabled={disabled || busy}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`exp-receipt-${projectId}`}>Receipt or invoice image{resubmittingId ? ' (optional if retaining existing evidence)' : ''}</Label>
            <Input
              key={`expense-${fileInputKey}`}
              id={`exp-receipt-${projectId}`}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={(e) => { setExpenseImage(e.target.files?.[0] || null); setUploadedExpenseImage('') }}
              disabled={disabled || busy}
            />
            <p className="text-xs text-muted-foreground">JPG, PNG, GIF or WebP; maximum 10 MB.
              {resubmittingId && (expense.receipt_url || expense.invoice_url || existingEvidence.length > 0) ? ' Existing evidence will be retained.' : ''}
            </p>
          </div>
          <div className="md:col-span-2">
            <Button type="button" size="sm" onClick={submitExpense} disabled={disabled || busy}>
              {busy ? 'Submitting…' : resubmittingId ? 'Resubmit expense' : 'Submit expense'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor={`mat-name-${projectId}`}>Name</Label>
            <Input
              id={`mat-name-${projectId}`}
              value={material.name}
              onChange={(e) => setMaterial((p) => ({ ...p, name: e.target.value }))}
              disabled={disabled || busy}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`mat-kind-${projectId}`}>Type</Label>
            <select
              id={`mat-kind-${projectId}`}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={material.item_kind}
              onChange={(e) => setMaterial((p) => ({ ...p, item_kind: e.target.value }))}
              disabled={disabled || busy}
            >
              <option value="consumable">Consumable</option>
              <option value="reusable_equipment">Reusable equipment</option>
            </select>
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor={`mat-desc-${projectId}`}>Description</Label>
            <Textarea
              id={`mat-desc-${projectId}`}
              value={material.description}
              onChange={(e) => setMaterial((p) => ({ ...p, description: e.target.value }))}
              disabled={disabled || busy}
              rows={2}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`mat-unit-${projectId}`}>Unit</Label>
            <Input id={`mat-unit-${projectId}`} value={material.unit}
              onChange={(e) => setMaterial((p) => ({ ...p, unit: e.target.value }))}
              disabled={disabled || busy} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`mat-required-${projectId}`}>Required quantity</Label>
            <Input id={`mat-required-${projectId}`} type="number" min="0" step="0.001"
              value={material.required_quantity}
              onChange={(e) => setMaterial((p) => ({ ...p, required_quantity: e.target.value }))}
              disabled={disabled || busy} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor={`mat-image-${projectId}`}>Material or invoice image (optional)</Label>
            <Input key={`material-${fileInputKey}`} id={`mat-image-${projectId}`} type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={(e) => { setMaterialImage(e.target.files?.[0] || null); setUploadedMaterialImage('') }}
              disabled={disabled || busy} />
            <p className="text-xs text-muted-foreground">JPG, PNG, GIF or WebP; maximum 10 MB.</p>
          </div>
          <details className="md:col-span-2">
            <summary className="cursor-pointer text-sm font-medium">Additional tracking details (optional)</summary>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
          {(
            [
              ['procured_quantity', 'Procured'],
              ['dispatched_quantity', 'Dispatched'],
              ['received_quantity', 'Received'],
              ['consumed_quantity', 'Consumed'],
              ['returned_quantity', 'Returned'],
              ['damaged_quantity', 'Damaged'],
              ['missing_quantity', 'Missing'],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="space-y-1">
              <Label htmlFor={`mat-${key}-${projectId}`}>{label}</Label>
              <Input
                id={`mat-${key}-${projectId}`}
                type="number"
                min="0"
                step="0.001"
                value={material[key]}
                onChange={(e) => setMaterial((p) => ({ ...p, [key]: e.target.value }))}
                disabled={disabled || busy}
              />
            </div>
          ))}
          <div className="space-y-1">
            <Label htmlFor={`mat-out-${projectId}`}>Outbound shipment ref</Label>
            <Input
              id={`mat-out-${projectId}`}
              value={material.outbound_shipment_ref}
              onChange={(e) => setMaterial((p) => ({ ...p, outbound_shipment_ref: e.target.value }))}
              disabled={disabled || busy}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`mat-ret-${projectId}`}>Return shipment ref</Label>
            <Input
              id={`mat-ret-${projectId}`}
              value={material.return_shipment_ref}
              onChange={(e) => setMaterial((p) => ({ ...p, return_shipment_ref: e.target.value }))}
              disabled={disabled || busy}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`mat-cost-${projectId}`}>Unit cost (info only)</Label>
            <Input
              id={`mat-cost-${projectId}`}
              type="number"
              min="0"
              step="0.01"
              value={material.unit_cost}
              onChange={(e) => setMaterial((p) => ({ ...p, unit_cost: e.target.value }))}
              disabled={disabled || busy}
            />
          </div>
            </div>
          </details>
          <div className="md:col-span-2">
            <Button type="button" size="sm" onClick={submitMaterial} disabled={disabled || busy}>
              {busy ? 'Submitting…' : 'Submit material record'}
            </Button>
          </div>
        </div>
      )}

      {message ? <p role="status" className="text-sm text-slate-700">{message}</p> : null}
      <div className="space-y-2 border-t pt-3">
        <Button type="button" variant="outline" size="sm" onClick={loadRecords} disabled={disabled || loadingRecords}>
          {loadingRecords ? 'Loading expenses…' : records === null ? 'View my submitted expenses' : 'Refresh my submitted expenses'}
        </Button>
        {recordsError ? <p role="alert" className="text-sm text-red-700">{recordsError}</p> : null}
        {records?.length === 0 ? <p className="text-sm text-muted-foreground">No submitted expenses yet.</p> : null}
        {records?.length ? (
          <ul className="space-y-1 text-sm">
            {records.map((record) => (
              <li key={record.id}>
                {record.expense_date} · {record.description} · INR {Number(record.amount).toLocaleString('en-IN')} · {record.approval_status}
                {['unreconciled', 'rejected'].includes(record.approval_status) ? (
                  <div className="space-y-1">
                    <p>Verifier reason: {record.metadata?.review_reason || 'No reason provided'}</p>
                    {record.payment_status === 'unpaid' ? (
                      <Button type="button" size="sm" variant="outline" disabled={disabled || busy} onClick={() => {
                        setTab('expense')
                        setResubmittingId(record.id)
                        setMessage(null)
                        setExpenseImage(null)
                        setUploadedExpenseImage('')
                        setExistingEvidence(Array.isArray(record.evidence_urls) ? record.evidence_urls.filter((url): url is string => typeof url === 'string' && Boolean(url)) : [])
                        setFileInputKey((key) => key + 1)
                        setExpense({
                          category: record.category, amount: String(record.amount), description: record.description || '',
                          expense_date: record.expense_date, vendor_or_recipient: record.vendor_or_recipient || '',
                          receipt_url: record.receipt_url || '', invoice_url: record.invoice_url || '',
                        })
                      }}>
                        Correct and resubmit
                      </Button>
                    ) : <p>This expense cannot be resubmitted because its payment status is {record.payment_status}.</p>}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  )
}
