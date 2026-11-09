import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { assertPublishableKey } from '@/lib/runtime-services';

export const createClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
  assertPublishableKey(key);
  return createSupabaseClient(url, key);
};
