// Supabase client configuration
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export const supabaseConfig = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  secretKey: process.env.SUPABASE_SECRET_KEY!,
}

// Create Supabase client for client-side usage
export const createClient = () => {
  return createSupabaseClient(
    supabaseConfig.url,
    supabaseConfig.publishableKey
  );
}

// Create Supabase client with secret key for server-side usage
export const createServerClient = () => {
  return createSupabaseClient(
    supabaseConfig.url,
    supabaseConfig.secretKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
}

// Auth-related types for future Supabase integration
export interface User {
  id: string
  email?: string
  phone?: string
  user_metadata?: Record<string, any>
  app_metadata?: Record<string, any>
}

export interface Session {
  access_token: string
  refresh_token: string
  user: User
}

// Auth functions using Supabase client
export const getUser = async (): Promise<User | null> => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export const getSession = async (): Promise<Session | null> => {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}
