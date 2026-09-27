import 'server-only'
import type { TablesInsert, TablesUpdate } from '@/lib/database.types'
import { supabase } from './client'

export const serviceOffers = {
  async getAll(
    filters: {
      status?: string
      creator_id?: number
      ngo_id?: number
      includeExpired?: boolean
    } = {}
  ) {
    let query = supabase.from('service_offers').select(`
      *,
      ngo:users!creator_id(name, email, user_type, verification_status)
    `);

    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    const creatorId = filters.creator_id || filters.ngo_id;
    if (creatorId) {
      query = query.eq('creator_id', creatorId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    const includeExpired = Boolean(filters.includeExpired)
    const now = Date.now()
    const nonExpiredOffers = includeExpired
      ? (data || [])
      : (data || []).filter((offer) => {
          const expiryValue = offer.valid_until
          if (!expiryValue) return true
          const expiryMs = Date.parse(String(expiryValue))
          if (Number.isNaN(expiryMs)) return true
          return expiryMs >= now
        })

    if (nonExpiredOffers && nonExpiredOffers.length > 0) {
      const offerIds = nonExpiredOffers.map((item) => item.id);

      const { data: hires } = await supabase
        .from('service_clients')
        .select('service_offer_id')
        .in('service_offer_id', offerIds)
        .eq('status', 'accepted');

      const hireCounts = (hires || []).reduce<Record<string, number>>((acc, hire) => {
        acc[hire.service_offer_id] = (acc[hire.service_offer_id] || 0) + 1;
        return acc;
      }, {});

      return nonExpiredOffers.map((offer) => ({
        ...offer,
        ngo_id: offer.creator_id,
        applications_count: hireCounts[offer.id] || 0
      }));
    }

    return nonExpiredOffers.map((offer) => ({
      ...offer,
      ngo_id: offer.creator_id
    }));
  },

  async getById(id: number) {
    const { data, error } = await supabase
      .from('service_offers')
      .select(`
        *,
        ngo:users!creator_id(name, email, user_type, location, verification_status, profile_image)
      `)
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data ? { ...data, ngo_id: data.creator_id } : data;
  },

  async create(offerData: TablesInsert<'service_offers'>) {
    const { data, error } = await supabase
      .from('service_offers')
      .insert(offerData)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async update(id: string | number, offerData: TablesUpdate<'service_offers'>) {
    const { data, error } = await supabase
      .from('service_offers')
      .update(offerData)
      .eq('id', Number(id))
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async delete(id: string | number, ngoId?: number) {
    let query = supabase
      .from('service_offers')
      .delete()
      .eq('id', Number(id));

    if (ngoId) {
      query = query.eq('creator_id', ngoId);
    }

    const { error } = await query;

    if (error) throw error;
    return true;
  }
}

export const serviceClients = {
  async create(clientData: TablesInsert<'service_clients'>) {
    const { data, error } = await supabase
      .from('service_clients')
      .insert(clientData)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getByOfferId(serviceOfferId: number) {
    const { data, error } = await supabase
      .from('service_clients')
      .select(`
        *,
        client:users!client_id(name, email, user_type)
      `)
      .eq('service_offer_id', serviceOfferId)
      .order('applied_at', { ascending: false });

    if (error) throw error;
    return data;
  }
}
