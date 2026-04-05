import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/auth';
import CADashboardClient from './ca-dashboard-client';

export default async function CADashboardPage() {
  const caToken = (await cookies()).get('ca-token')?.value;

  if (!caToken) {
    redirect('/ca/login');
  }

  const decoded = verifyToken(caToken);
  if (!decoded || decoded.id !== -2) {
    redirect('/ca/login');
  }

  return <CADashboardClient />;
}
