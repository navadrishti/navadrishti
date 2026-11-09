'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { FieldOfficersState } from './use-field-officers'
import { officerDisplayName, officerEmail } from './types'

export function FieldOfficerResetPasswordDialog({ fo }: { fo: FieldOfficersState }) {
  return (
    <Dialog
      open={fo.resetDialogOpen}
      onOpenChange={(open) => (open ? fo.setResetDialogOpen(true) : fo.closeResetDialog())}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset field officer password</DialogTitle>
          <DialogDescription>
            Set a temporary password for{' '}
            <span className="font-medium text-slate-900">
              {fo.resetTarget ? officerDisplayName(fo.resetTarget) : 'this officer'}
            </span>{' '}
            ({fo.resetTarget ? officerEmail(fo.resetTarget) : 'no email'}). They must change it on
            their next field app login.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fo-reset-password">Temporary password</Label>
            <Input
              id="fo-reset-password"
              type="password"
              value={fo.resetPassword}
              onChange={(event) => fo.setResetPassword(event.target.value)}
              placeholder="Minimum 8 characters"
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fo-reset-confirm-password">Confirm password</Label>
            <Input
              id="fo-reset-confirm-password"
              type="password"
              value={fo.resetConfirmPassword}
              onChange={(event) => fo.setResetConfirmPassword(event.target.value)}
              placeholder="Re-enter password"
              autoComplete="new-password"
            />
          </div>
          {fo.resetError ? <p className="text-sm text-rose-700">{fo.resetError}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={fo.closeResetDialog} disabled={fo.resettingPassword}>
            Cancel
          </Button>
          <Button type="button" onClick={fo.handleResetPassword} disabled={fo.resettingPassword}>
            {fo.resettingPassword ? 'Resetting…' : 'Reset password'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
