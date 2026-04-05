import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { supabase } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import CompanyCAPanelClient from './company-ca-panel-client';

export default async function CompanyCAPanelPage() {
  const token = (await cookies()).get('company-ca-token')?.value;

  if (!token) {
    redirect('/companies/ca/login');
  }

  const user = verifyToken(token);
  if (!user) {
    redirect('/companies/ca/login');
  }

  const { data: identity, error } = await supabase
    .from('company_ca_identities')
    .select('id, status')
    .eq('user_id', user.id)
    .single();

  if (error || !identity || identity.status !== 'active') {
    redirect('/companies/ca/login');
  }

  return <CompanyCAPanelClient />;
}
