'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAuth } from '@/lib/auth-context'
import { Shield, Lock, Trash, AlertTriangle } from 'lucide-react'
import Link from 'next/link'

// Delete Account Dialog - moved inline since only used here
interface DeleteAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (password: string, confirmation: string) => Promise<void>
  loading: boolean
  error: string
}

function DeleteAccountDialog({ open, onOpenChange, onConfirm, loading, error }: DeleteAccountDialogProps) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [step, setStep] = useState(1)

  const handleClose = () => {
    if (!loading) {
      setPassword('')
      setConfirmation('')
      setStep(1)
      onOpenChange(false)
    }
  }

  const isStep2Valid = confirmation === 'DELETE MY ACCOUNT'

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash className="h-5 w-5" />
            Delete Account
          </DialogTitle>
          <DialogDescription>This action is permanent and cannot be undone.</DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
                <div className="space-y-2">
                  <h4 className="font-semibold text-destructive">Warning: This will permanently delete:</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Your account and profile information</li>
                    <li>• Your service requests and applications</li>
                    <li>• All verification records</li>
                  </ul>
                </div>
              </div>
            </div>

            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

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
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                <div>
                  <h4 className="font-semibold text-destructive">Final Confirmation Required</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    This is your last chance to cancel.
                  </p>
                </div>
              </div>
            </div>

            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

            <div className="space-y-2">
              <Label htmlFor="confirmation">Type <strong>"DELETE MY ACCOUNT"</strong> to confirm</Label>
              <Input
                id="confirmation"
                type="text"
                placeholder="Type: DELETE MY ACCOUNT"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                disabled={loading}
                className={isStep2Valid ? 'border-destructive' : ''}
              />
            </div>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {step === 1 ? (
            <>
              <Button variant="outline" onClick={handleClose} disabled={loading} className="w-full sm:w-auto">Cancel</Button>
              <Button onClick={() => password.trim() && setStep(2)} disabled={!password.trim() || loading} className="w-full sm:w-auto">Continue</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep(1)} disabled={loading} className="w-full sm:w-auto">Back</Button>
              <Button variant="destructive" onClick={() => onConfirm(password, confirmation)} disabled={!isStep2Valid || loading} className="w-full sm:w-auto">
                {loading ? 'Deleting...' : 'Delete My Account'}
              </Button>
            </>
          )}
        </DialogFooter>

        <div className="flex items-center justify-center gap-2 pt-2">
          <div className={`h-2 w-2 rounded-full ${step >= 1 ? 'bg-primary' : 'bg-muted'}`} />
          <div className={`h-2 w-2 rounded-full ${step >= 2 ? 'bg-primary' : 'bg-muted'}`} />
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function SettingsPage() {
  const { user, token, logout } = useAuth();
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Loading and error states
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  
  // Delete account dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Handle password change
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Clear previous states
    setPasswordError('');
    setPasswordSuccess('');
    
    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('Please fill in all password fields');
      return;
    }
    
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters long');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }
    
    setPasswordLoading(true);
    
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          currentPassword,
          newPassword
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setPasswordSuccess('Password changed successfully!');
        // Clear form
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setPasswordError(data.error || 'Failed to change password');
      }
    } catch (error) {
      setPasswordError('An error occurred while changing password');
    } finally {
      setPasswordLoading(false);
    }
  };

  // Handle account deletion
  const handleDeleteAccount = async (password: string, confirmation: string) => {
    setDeleteError('');
    setDeleteLoading(true);
    
    try {
      const response = await fetch('/api/auth/delete-account', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          password,
          confirmation
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        // Close dialog
        setDeleteDialogOpen(false);
        
        // Log out user
        logout();
        
        // Show success message and redirect
        alert('Your account has been successfully deleted. We are sorry to see you go!');
        router.push('/');
      } else {
        setDeleteError(data.error || 'Failed to delete account');
      }
    } catch (error) {
      setDeleteError('An error occurred while deleting your account');
    } finally {
      setDeleteLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 px-6 py-8 md:px-10">
          <div className="text-center py-8">
            <h1 className="text-2xl font-bold mb-4">Sign In Required</h1>
            <Link href="/login">
              <Button>Sign In</Button>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      
      <main className="flex-1 px-6 py-8 md:px-10">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
            <p className="text-muted-foreground">
              Manage your account settings
            </p>
          </div>

          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="h-5 w-5" />
                  Account Security
                </CardTitle>
                <CardDescription>
                  Manage your password and security settings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handlePasswordChange} className="space-y-4">
                  {passwordError && (
                    <Alert variant="destructive">
                      <AlertDescription>{passwordError}</AlertDescription>
                    </Alert>
                  )}
                  
                  {passwordSuccess && (
                    <Alert>
                      <AlertDescription className="text-green-600">{passwordSuccess}</AlertDescription>
                    </Alert>
                  )}
                  
                  <div className="space-y-2">
                    <Label>Current Password</Label>
                    <Input 
                      type="password" 
                      placeholder="Enter current password" 
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      disabled={passwordLoading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>New Password</Label>
                    <Input 
                      type="password" 
                      placeholder="Enter new password (min 8 characters)"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      disabled={passwordLoading}
                      minLength={8}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Confirm New Password</Label>
                    <Input 
                      type="password" 
                      placeholder="Confirm new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      disabled={passwordLoading}
                      minLength={8}
                    />
                  </div>
                  <Button type="submit" disabled={passwordLoading}>
                    {passwordLoading ? 'Updating...' : 'Update Password'}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="border-destructive/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive">
                  <Trash className="h-5 w-5" />
                  Danger Zone
                </CardTitle>
                <CardDescription>
                  Irreversible and destructive actions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  variant="destructive" 
                  className="w-full"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  <Trash className="h-4 w-4 mr-2" />
                  Delete Account
                </Button>
                <p className="text-sm text-muted-foreground mt-2">
                  This action cannot be undone. This will permanently delete your account and remove your data from our servers.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Delete Account Dialog */}
      <DeleteAccountDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteAccount}
        loading={deleteLoading}
        error={deleteError}
      />
    </div>
  );
}