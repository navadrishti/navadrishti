import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyNavadrishtCAToken } from '@/lib/navadrishti-ca-auth';
import { supabase } from '@/lib/db';
import CAChangePasswordClient from './change-password-client';

export default async function CAChangePasswordPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('navadrishti-ca-token')?.value;

  if (!token) {
    redirect('/ca/login');
  }

  const decoded = verifyNavadrishtCAToken(token);
  if (!decoded?.id) {
    redirect('/ca/login');
  }

  const { data: account } = await supabase
    .from('navadrishti_ca_accounts')
    .select('id, active')
    .eq('id', decoded.id)
    .maybeSingle();

  if (!account || account.active === false) {
    redirect('/ca/login');
  }

  return <CAChangePasswordClient />;
}
