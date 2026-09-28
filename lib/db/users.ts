import 'server-only'
import type { TablesInsert, TablesUpdate } from '@/lib/database.types'
import { supabase } from './client'

// The generated Insert type requires ngo_volunteer_capacity, but non-NGO signups never send it.
type NewUser = Omit<TablesInsert<'users'>, 'ngo_volunteer_capacity'> &
  Partial<Pick<TablesInsert<'users'>, 'ngo_volunteer_capacity'>>

// Everything except password and two_factor_secret.
const USER_COLUMNS = 'id, email, user_type, name, phone, location, created_at, updated_at, email_verified, phone_verified, two_factor_enabled, account_status, last_login, login_attempts, locked_until, timezone, preferences, privacy_settings, verification_status, verification_level, verified_at, city, state_province, pincode, country, email_verified_at, phone_verified_at, age, work_experience, industry, website, company_size, ngo_size, profile_image, profile_data, device_id, ngo_volunteer_capacity'

export const users = {
  async findByEmail(email: string) {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return null;

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .ilike('email', normalized.replace(/[\\%_]/g, (char) => `\\${char}`))
      .order('id', { ascending: true })
      .limit(10);

    if (error) throw error;
    const rows = data ?? [];
    return (
      rows.find((row) => row.email === normalized) ??
      rows.find((row) => row.email.toLowerCase() === normalized) ??
      null
    );
  },

  async create(userData: NewUser) {
    const { data, error } = await supabase
      .from('users')
      .insert(userData as TablesInsert<'users'>)
      .select(USER_COLUMNS)
      .single();

    if (error) throw error;
    return data;
  },

  async update(id: number, userData: TablesUpdate<'users'>) {
    const { data, error } = await supabase
      .from('users')
      .update(userData)
      .eq('id', id)
      .select(USER_COLUMNS)
      .single();

    if (error) throw error;
    return data;
  },

  async findById(id: number) {
    const { data, error } = await supabase
      .from('users')
      .select(USER_COLUMNS)
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  /** Only for flows that must verify the current password; never return the row to a client. */
  async findByIdWithPassword(id: number) {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, password')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }
}

export const userAddresses = {
  async getByUserId(userId: number) {
    const { data, error } = await supabase
      .from('user_addresses')
      .select('*')
      .eq('user_id', userId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  async getById(id: number) {
    const { data, error } = await supabase
      .from('user_addresses')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async create(addressData: TablesInsert<'user_addresses'>) {
    if (addressData.is_default) {
      await supabase
        .from('user_addresses')
        .update({ is_default: false })
        .eq('user_id', addressData.user_id);
    }

    const { data, error } = await supabase
      .from('user_addresses')
      .insert(addressData)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async update(id: number, addressData: TablesUpdate<'user_addresses'>) {
    if (addressData.is_default) {
      const address = await this.getById(id);
      if (address) {
        await supabase
          .from('user_addresses')
          .update({ is_default: false })
          .eq('user_id', address.user_id)
          .neq('id', id);
      }
    }

    const { data, error } = await supabase
      .from('user_addresses')
      .update(addressData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async delete(id: number) {
    const { error } = await supabase
      .from('user_addresses')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  }
}
