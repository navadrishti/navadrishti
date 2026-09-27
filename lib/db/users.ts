import 'server-only'
import type { TablesInsert, TablesUpdate } from '@/lib/database.types'
import { supabase } from './client'

// The generated Insert type requires ngo_volunteer_capacity, but non-NGO signups never send it.
type NewUser = Omit<TablesInsert<'users'>, 'ngo_volunteer_capacity'> &
  Partial<Pick<TablesInsert<'users'>, 'ngo_volunteer_capacity'>>

export const users = {
  async findByEmail(email: string) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async create(userData: NewUser) {
    const { data, error } = await supabase
      .from('users')
      .insert(userData as TablesInsert<'users'>)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async update(id: number, userData: TablesUpdate<'users'>) {
    const { data, error } = await supabase
      .from('users')
      .update(userData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async findById(id: number) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
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
