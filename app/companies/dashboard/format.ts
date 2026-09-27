import { formatStatusLabel } from '@/lib/format-date';

export const formatDisplayDate = (value?: string | null): string => {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

export const formatLeadNgoInviteStatusLabel = (status: string): string => {
  const normalized = String(status || '').trim().toLowerCase();
  if (['pending', 'invited', 'pending_acceptance', 'awaiting_acceptance', 'offered', 'assigned'].includes(normalized)) {
    return 'Pending';
  }
  return formatStatusLabel(status);
};

export const isRemovableLeadInviteStatus = (status: string): boolean =>
  ['pending', 'invited', 'pending_acceptance', 'awaiting_acceptance', 'offered'].includes(String(status || '').trim().toLowerCase());

export const getInitials = (name: string): string => {
  if (!name) return 'N';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
};
