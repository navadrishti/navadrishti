import type { NgoCsrProject } from './types';

export const isActionableProjectApplicationStatus = (status: string): boolean => {
  const normalized = String(status || '').toLowerCase();
  return ['pending', 'pledged', 'invited', 'pending_acceptance', 'awaiting_acceptance', 'offered', 'assigned'].includes(normalized);
};

export const isActionableLeadInvitationStatus = (status: string): boolean =>
  ['pending', 'invited', 'pending_acceptance', 'awaiting_acceptance', 'offered', 'assigned'].includes(String(status || '').toLowerCase());

export const getProjectBucket = (project: NgoCsrProject): 'invitation' | 'ongoing' | 'completed' => {
  const status = String(project?.project_status || '').toLowerCase().trim();
  const progress = Number(project?.progress_percentage ?? 0);

  if (['completed', 'closed', 'finished', 'done'].includes(status) || progress >= 100) {
    return 'completed';
  }

  if (['invited', 'pending', 'pending_acceptance', 'awaiting_acceptance', 'assigned', 'offered'].includes(status)) {
    return 'invitation';
  }

  return 'ongoing';
};

export const getInitials = (name: string, fallback: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || fallback;

export const joinPresent = (values: Array<string | null | undefined>): string =>
  values
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' · ');
