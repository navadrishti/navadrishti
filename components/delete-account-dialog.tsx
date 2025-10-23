'use client';

import { useState } from 'react';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Trash, Shield, AlertTriangle } from 'lucide-react';

interface DeleteAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (password: string, confirmation: string) => Promise<void>;
  loading: boolean;
  error: string;
}

export function DeleteAccountDialog({
  open,
  onOpenChange,
  onConfirm,
  loading,
  error
}: DeleteAccountDialogProps) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [step, setStep] = useState(1);

  const handleClose = () => {
    if (!loading) {
      setPassword('');
      setConfirmation('');
      setStep(1);
      onOpenChange(false);
    }
  };

  const handleNextStep = () => {
    if (password.trim()) {
      setStep(2);
    }
  };

  const handlePrevStep = () => {
    setStep(1);
  };

  const handleConfirm = async () => {
    if (password.trim() && confirmation === 'DELETE MY ACCOUNT') {
      await onConfirm(password, confirmation);
    }
  };

  const isStep2Valid = confirmation === 'DELETE MY ACCOUNT';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash className="h-5 w-5" />
            Delete Account
          </DialogTitle>
          <DialogDescription>
            This action is permanent and cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            {/* Warning Section */}
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
                <div className="space-y-2">
                  <h4 className="font-semibold text-destructive">Warning: This will permanently delete:</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Your account and profile information</li>
                    <li>• All your marketplace listings and orders</li>
                    <li>• Your service requests and applications</li>
                    <li>• Your cart items and wishlist</li>
                    <li>• All verification records</li>
                    <li>• This action cannot be reversed</li>
                  </ul>
                </div>
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="password" className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Enter your current password to continue
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Current password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                autoComplete="current-password"
              />
              <p className="text-xs text-muted-foreground">
                We need to verify your identity before proceeding.
              </p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            {/* Final Confirmation */}
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-destructive">Final Confirmation Required</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    This is your last chance to cancel. Once you proceed, your account will be permanently deleted.
                  </p>
                </div>
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="confirmation">
                Type <strong>"DELETE MY ACCOUNT"</strong> to confirm
              </Label>
              <Input
                id="confirmation"
                type="text"
                placeholder="Type: DELETE MY ACCOUNT"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                disabled={loading}
                className={isStep2Valid ? 'border-destructive' : ''}
              />
              <p className="text-xs text-muted-foreground">
                This must be typed exactly as shown above.
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {step === 1 && (
            <>
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={loading}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                onClick={handleNextStep}
                disabled={!password.trim() || loading}
                className="w-full sm:w-auto"
              >
                Continue
              </Button>
            </>
          )}

          {step === 2 && (
            <>
              <Button
                variant="outline"
                onClick={handlePrevStep}
                disabled={loading}
                className="w-full sm:w-auto"
              >
                Back
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirm}
                disabled={!isStep2Valid || loading}
                className="w-full sm:w-auto"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Deleting Account...
                  </>
                ) : (
                  <>
                    <Trash className="h-4 w-4 mr-2" />
                    Delete My Account
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>

        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 pt-2">
          <div className={`h-2 w-2 rounded-full ${step >= 1 ? 'bg-primary' : 'bg-muted'}`} />
          <div className={`h-2 w-2 rounded-full ${step >= 2 ? 'bg-primary' : 'bg-muted'}`} />
        </div>
      </DialogContent>
    </Dialog>
  );
}