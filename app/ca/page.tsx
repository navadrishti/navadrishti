import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyNavadrishtCAToken } from '@/lib/navadrishti-ca-auth';
import { supabase } from '@/lib/db';
import CADashboardClient from './ca-dashboard-client';

export default async function CADashboardPage() {
  const caToken = (await cookies()).get('navadrishti-ca-token')?.value;

  if (!caToken) {
    redirect('/ca/login');
  }

  const decoded = verifyNavadrishtCAToken(caToken);
  if (!decoded) {
    redirect('/ca/login');
  }

  // Check if password change is mandatory
  const { data: account, error } = await supabase
    .from('navadrishti_ca_accounts')
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
