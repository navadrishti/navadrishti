import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  verifyPlatformCAToken,
  PLATFORM_CA_COOKIE,
  PLATFORM_CA_ACCOUNTS_TABLE,
} from '@/lib/platform-ca-auth';
import { supabase } from '@/lib/db';
import CAChangePasswordClient from './change-password-client';

export default async function CAChangePasswordPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(PLATFORM_CA_COOKIE)?.value;

  if (!token) {
    redirect('/ca/login');
  }

  const decoded = verifyPlatformCAToken(token);
  if (!decoded?.id) {
    redirect('/ca/login');
  }

  const { data: account } = await supabase
    .from(PLATFORM_CA_ACCOUNTS_TABLE)
    .select('id, active')
    .eq('id', decoded.id)
    .maybeSingle();

  if (!account || account.active === false) {
    redirect('/ca/login');
  }

  return <CAChangePasswordClient />;
}
