import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getNavadrishtCAFromRequest } from '@/lib/navadrishti-ca-auth';
import CAChangePasswordClient from './change-password-client';

export default async function CAChangePasswordPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('navadrishti-ca-token')?.value;

  if (!token) {
    redirect('/ca/login');
  }

  try {
    const account = await getNavadrishtCAFromRequest({ cookies: () => cookieStore } as any);
    if (!account) {
      redirect('/ca/login');
    }

    // Allow access to change password page regardless of must_change_password
    // Users can change password voluntarily from navbar
    // if (!account.must_change_password) {
    //   redirect('/ca');
    // }
  } catch (error) {
    redirect('/ca/login');
  }

  return <CAChangePasswordClient />;
}
