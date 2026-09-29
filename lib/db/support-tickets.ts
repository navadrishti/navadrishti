import 'server-only'
import type { TablesInsert, TablesUpdate } from '@/lib/database.types'
import { toSearchPattern } from '@/lib/utils'
import { supabase } from './client'

export const supportTickets = {
  async create(ticketData: TablesInsert<'support_tickets'>) {
    const { data, error } = await supabase
      .from('support_tickets')
      .insert(ticketData)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getAll(filters: { status?: string; search?: string } = {}) {
    let query = supabase
      .from('support_tickets')
      .select(`
        *,
        user:users!user_id(id, name, email, user_type, verification_status, profile_image)
      `)
      .order('created_at', { ascending: false });

    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    const term = toSearchPattern(filters.search);
    if (term) {
      query = query.or(`title.ilike.${term},description.ilike.${term},ticket_id.ilike.${term}`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async update(id: number | string, updateData: TablesUpdate<'support_tickets'>) {
    const { data, error } = await supabase
      .from('support_tickets')
      .update(updateData)
      .eq('id', Number(id))
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getByTicketId(ticketId: string) {
    const { data, error } = await supabase
      .from('support_tickets')
      .select(`
        *,
        user:users!user_id(id, name, email, user_type, verification_status, profile_image)
      `)
      .eq('ticket_id', ticketId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async getById(id: number | string) {
    if (typeof id === 'string' && id.startsWith('SUP-')) {
      return this.getByTicketId(id);
    }

    const { data, error } = await supabase
      .from('support_tickets')
      .select(`
        *,
        user:users!user_id(id, name, email, user_type, verification_status, profile_image)
      `)
      .eq('id', Number(id))
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async getByUserId(userId: number, filters: { status?: string } = {}) {
    let query = supabase
      .from('support_tickets')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (filters.status === 'open') {
      query = query.in('status', ['open', 'in_progress']);
    } else if (filters.status === 'closed') {
      query = query.in('status', ['resolved', 'closed']);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }
}

export const supportTicketMessages = {
  async create(messageData: TablesInsert<'support_ticket_messages'>) {
    const { data, error } = await supabase
      .from('support_ticket_messages')
      .insert(messageData)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getByTicketId(ticketId: string) {
    // No FK from sender_id → users in schema; do not embed users!sender_id.
    const { data, error } = await supabase
      .from('support_ticket_messages')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  }
}
