'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

export function useNewTicket(
  isLoggedIn: boolean,
  token: string | null | undefined,
  onSubmitted: (ticketId: string) => Promise<void>
) {
  const router = useRouter();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [proof, setProof] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!isLoggedIn || !token) {
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
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        toast({ title: 'Submission failed', description: payload?.error || 'Could not submit your ticket.', variant: 'destructive' });
        return;
      }

      const ticketId = payload.data?.ticketId as string;
      toast({ title: 'Ticket submitted', description: `Reference ${ticketId}` });
      setTitle('');
      setDescription('');
      setProof(null);
      await onSubmitted(ticketId);
    } catch {
      toast({ title: 'Submission failed', description: 'Could not submit your ticket.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return {
    title,
    setTitle,
    description,
    setDescription,
    proof,
    setProof,
    submitting,
    handleSubmit,
  };
}

export type NewTicketState = ReturnType<typeof useNewTicket>;
