'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { CompanyCaAccountsState } from './use-company-ca-accounts';

interface CaResetPasswordDialogProps {
  ca: CompanyCaAccountsState;
}

export function CaResetPasswordDialog({ ca }: CaResetPasswordDialogProps) {
  const {
    caResetDialogOpen,
    setCaResetDialogOpen,
    caResetTarget,
    caResetPassword,
    setCaResetPassword,
    caResetConfirmPassword,
    setCaResetConfirmPassword,
    resettingCaPassword,
    closeCaResetPasswordDialog,
    handleResetCaPassword,
  } = ca;

  return (
    <Dialog open={caResetDialogOpen} onOpenChange={(open) => (open ? setCaResetDialogOpen(true) : closeCaResetPasswordDialog())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset CA password</DialogTitle>
          <DialogDescription>
            Set a temporary password for{' '}
            <span className="font-medium text-slate-900">{caResetTarget?.users?.name || 'this CA'}</span>{' '}
            ({caResetTarget?.users?.email || 'no email'}). They will be required to change it on next login.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ca-reset-password">New temporary password</Label>
            <Input
              id="ca-reset-password"
              type="password"
              value={caResetPassword}
              onChange={(event) => setCaResetPassword(event.target.value)}
              placeholder="Minimum 8 characters"
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ca-reset-confirm-password">Confirm password</Label>
            <Input
              id="ca-reset-confirm-password"
              type="password"
              value={caResetConfirmPassword}
              onChange={(event) => setCaResetConfirmPassword(event.target.value)}
              placeholder="Re-enter password"
              autoComplete="new-password"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={closeCaResetPasswordDialog} disabled={resettingCaPassword}>
            Cancel
          </Button>
          <Button type="button" onClick={handleResetCaPassword} disabled={resettingCaPassword}>
            {resettingCaPassword ? 'Resetting...' : 'Reset password'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
