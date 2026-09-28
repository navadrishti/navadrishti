'use client';

import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { NewTicketState } from './use-new-ticket';

export function NewTicketForm({ form, isLoggedIn }: { form: NewTicketState; isLoggedIn: boolean }) {
  const { title, setTitle, description, setDescription, proof, setProof, submitting, handleSubmit } = form;

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="text-slate-900">Raise a Support Ticket</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {!isLoggedIn ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Please log in to raise a ticket.</AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="ticket-title">Title</Label>
          <Input
            id="ticket-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Short summary of the issue"
            className="border-slate-200"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ticket-description">Description</Label>
          <Textarea
            id="ticket-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            placeholder="Describe what happened, when it happened, and what you need help with."
            className="border-slate-200"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ticket-proof">Proof</Label>
          <Input
            id="ticket-proof"
            type="file"
            accept="image/*,.pdf,.doc,.docx"
            onChange={(e) => setProof(e.target.files?.[0] || null)}
            className="border-slate-200 bg-white"
          />
          <p className="text-xs text-slate-500">Upload a screenshot, PDF, or document that supports your issue.</p>
          {proof ? <p className="text-xs font-medium text-slate-700">Selected: {proof.name}</p> : null}
        </div>

        <Button
          onClick={handleSubmit}
          disabled={submitting || !isLoggedIn}
          className="bg-udaan-blue text-white hover:bg-udaan-blue/90"
        >
          {submitting ? 'Submitting...' : 'Submit Ticket'}
        </Button>
      </CardContent>
    </Card>
  );
}
