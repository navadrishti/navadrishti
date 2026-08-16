import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  verifyPlatformCAToken,
  PLATFORM_CA_COOKIE,
  PLATFORM_CA_ACCOUNTS_TABLE,
} from '@/lib/platform-ca-auth';
import { supabase } from '@/lib/db';
import CADashboardClient from './ca-dashboard-client';

export default async function CADashboardPage() {
  const caToken = (await cookies()).get(PLATFORM_CA_COOKIE)?.value;

  if (!caToken) {
    redirect('/ca/login');
  }

  const decoded = verifyPlatformCAToken(caToken);
  if (!decoded) {
    redirect('/ca/login');
  }

  // Check if password change is mandatory
  const { data: account, error } = await supabase
    .from(PLATFORM_CA_ACCOUNTS_TABLE)
    .select('must_change_password')
    .eq('id', decoded.id)
    .single();

  if (error || !account) {
    redirect('/ca/login');
  }

  if (account.must_change_password) {
    redirect('/ca/change-password');
  }

  return <CADashboardClient />;
}
