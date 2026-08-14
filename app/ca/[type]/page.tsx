import { notFound } from 'next/navigation';
import VerificationDetailsPage from '@/components/verification-details-page';
import { CA_QUEUE_TYPES, type CAQueueType } from '@/lib/ca-review-types';

export function generateStaticParams() {
  return CA_QUEUE_TYPES.map((type) => ({ type }));
}

export default async function CAQueueTypePage({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const { type } = await params;
  if (!CA_QUEUE_TYPES.includes(type as CAQueueType)) {
    notFound();
  }

  return <VerificationDetailsPage type={type as CAQueueType} />;
}
