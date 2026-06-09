import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyNavadrishtCAToken } from '@/lib/navadrishti-ca-auth';
import { verifyToken } from '@/lib/auth';
import VerificationDetailsPage from '@/components/verification-details-page';

export default async function CompaniesPage() {
  // Check CA authentication
  const cookieStore = await cookies();
  const caToken =
    cookieStore.get('navadrishti-ca-token')?.value ??
    cookieStore.get('ca-token')?.value;

  const isValidToken =
    Boolean(verifyNavadrishtCAToken(caToken || '')) ||
    Boolean(verifyToken(caToken || '')?.id === -2);

  if (!isValidToken) {
    redirect('/ca/login');
  }

  return <VerificationDetailsPage type="companies" />;
}
