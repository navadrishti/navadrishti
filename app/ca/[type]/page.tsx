import { notFound } from 'next/navigation';
import VerificationDetailsPage from '@/components/verification-details-page';
import { CA_QUEUE_TYPES, type CAQueueType } from '@/lib/ca-review-types';

export function generateStaticParams() {
  return CA_QUEUE_TYPES.map((type) => ({ type }));
}

function queueStatusFromQuery(value: unknown): 'all' | 'pending' | 'verified' {
  const status = String(value || '').trim().toLowerCase();
  if (status === 'pending' || status === 'verified') return status;
  return 'all';
}

export default async function CAQueueTypePage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string }>;
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const { type } = await params;
  if (!CA_QUEUE_TYPES.includes(type as CAQueueType)) {
    notFound();
  }

  const query = await searchParams;
  return (
    <VerificationDetailsPage
      type={type as CAQueueType}
      initialStatus={queueStatusFromQuery(Array.isArray(query.status) ? query.status[0] : query.status)}
    />
  );
}
