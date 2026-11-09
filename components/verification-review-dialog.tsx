'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { VerificationReviewNotice } from '@/lib/verification-review-notice'

export function VerificationReviewDialog({
  notice,
  applyLabel,
  onApply,
}: {
  notice: VerificationReviewNotice | null
  applyLabel: string
  onApply: () => void
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setOpen(Boolean(notice))
  }, [notice])

  if (!notice) return null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{notice.title}</DialogTitle>
          <DialogDescription>{notice.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            className="border-udaan-orange text-udaan-orange hover:bg-orange-50"
            variant="outline"
            onClick={() => {
              setOpen(false)
              onApply()
            }}
          >
            {applyLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
