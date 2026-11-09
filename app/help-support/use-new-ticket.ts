'use client';
import { toast } from 'sonner'

import { readApiError } from '@/lib/user-facing-error'
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function useNewTicket(
  isLoggedIn: boolean,
  token: string | null | undefined,
  onSubmitted: (ticketId: string) => Promise<void>
) {
  const router = useRouter();  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [proof, setProof] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!isLoggedIn || !token) {
      toast.error('Login required', { description: 'Please log in to submit a support ticket.' });
      router.push('/login');
      return;
    }

    if (title.trim().length < 3) {
      toast.error('Title required', { description: 'Please enter a clear issue title.' });
      return;
    }

    if (description.trim().length < 10) {
      toast.error('Description required', { description: 'Please describe the issue in a little more detail.' });
      return;
    }

    if (!proof) {
      toast.error('Proof required', { description: 'Please upload proof for the issue.' });
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
        toast.error('Submission failed', { description: readApiError(payload, 'Could not submit your ticket.') });
        return;
      }

      const ticketId = payload.data?.ticketId as string;
      toast.success('Ticket submitted', { description: `Reference ${ticketId}` });
      setTitle('');
      setDescription('');
      setProof(null);
      await onSubmitted(ticketId);
    } catch {
      toast.error('Submission failed', { description: 'Could not submit your ticket.' });
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
