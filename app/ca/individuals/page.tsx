import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import VerificationDetailsPage from '@/components/verification-details-page';

export default async function IndividualsPage() {
  // Check CA authentication
  const cookieStore = await cookies();
  const caToken = cookieStore.get('ca-token')?.value;

  if (!caToken) {
    redirect('/ca/login');
  }

  return <VerificationDetailsPage type="individuals" />;
}
