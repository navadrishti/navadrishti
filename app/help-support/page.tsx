'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, FileText } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Header } from '@/components/header';
import { useToast } from '@/hooks/use-toast';

export default function HelpSupportPage() {
  const router = useRouter();
  const { user, token } = useAuth();
  const { toast } = useToast();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [proof, setProof] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!user || !token) {
      toast({ title: 'Login required', description: 'Please log in to submit a support ticket.', variant: 'destructive' });
      router.push('/login');
      return;
    }

    if (title.trim().length < 3) {
      toast({ title: 'Title required', description: 'Please enter a clear issue title.', variant: 'destructive' });
      return;
    }

    if (description.trim().length < 10) {
      toast({ title: 'Description required', description: 'Please describe the issue in a little more detail.', variant: 'destructive' });
      return;
    }

    if (!proof) {
      toast({ title: 'Proof required', description: 'Please upload proof for the issue.', variant: 'destructive' });
      return;
    }

    const formData = new FormData();
    formData.append('title', title.trim());
    formData.append('description', description.trim());
    formData.append('proof', proof);

    setSubmitting(true);
    try {
      const response = await fetch('/api/help-support', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        toast({ title: 'Submission failed', description: payload?.error || 'Could not submit your ticket.', variant: 'destructive' });
        return;
      }

      toast({ title: 'Ticket submitted', description: `Reference ${payload.data?.ticketId || ''}`.trim() });
      setTitle('');
      setDescription('');
      setProof(null);
    } catch (error) {
      toast({ title: 'Submission failed', description: 'Could not submit your ticket.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <Header />
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => router.back()} className="px-0 text-blue-600 hover:text-blue-800 hover:bg-transparent">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Card className="lg:sticky lg:top-20">
              <CardHeader>
                <CardTitle>Help & Support</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-slate-600">
                <p>Use this form to raise a ticket directly to the admin team.</p>
                <p>Refunds are handled only by admin. Platform users cannot initiate refunds here.</p>
                <p>Attach proof so the team can verify the issue faster.</p>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Raise a Support Ticket
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {!user ? (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Please log in to raise a ticket.
                    </AlertDescription>
                  </Alert>
                ) : null}

                <div className="space-y-2">
                  <Label htmlFor="ticket-title">Title</Label>
                  <Input id="ticket-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short summary of the issue" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ticket-description">Description</Label>
                  <Textarea
                    id="ticket-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={6}
                    placeholder="Describe what happened, when it happened, and what you need help with."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ticket-proof">Proof</Label>
                  <div className="rounded-lg border border-dashed bg-white p-4">
                    <Input
                      id="ticket-proof"
                      type="file"
                      accept="image/*,.pdf,.doc,.docx"
                      onChange={(e) => setProof(e.target.files?.[0] || null)}
                    />
                    <p className="mt-2 text-xs text-slate-500">Upload a screenshot, PDF, or document that supports your issue.</p>
                    {proof ? <p className="mt-2 text-xs font-medium text-slate-700">Selected: {proof.name}</p> : null}
                  </div>
                </div>

                <Button onClick={handleSubmit} disabled={submitting || !user} className="w-full">
                  {submitting ? 'Submitting...' : 'Submit Ticket'}
                </Button>

                <p className="text-xs text-slate-500">
                  By submitting, you agree that admin may contact you using your registered email to resolve the issue.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}