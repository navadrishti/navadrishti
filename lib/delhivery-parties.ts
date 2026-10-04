import { createHash } from 'crypto';
import { supabase } from '@/lib/db';
import { normalizeDelhiveryPhone, normalizeDelhiveryPincode, upsertDelhiveryWarehouse } from '@/lib/delhivery';
import { parseJsonObject } from '@/lib/utils';

export type DelhiveryParty = {
  userId: number;
  name: string;
  phone: string;
  email: string | null;
  address: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
};

export type StructuredAddress = {
  address_line: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
};

const PROFILE_ADDRESS_KEYS = ['ngo_headquarters', 'company_headquarters', 'home_address', 'shipping_address'];

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

/** Reads an address stored as an object or a JSON string; plain text lines have no structure to trust. */
export function readStructuredAddress(raw: unknown): StructuredAddress | null {
  let value = raw;
  if (typeof value === 'string' && value.trim().startsWith('{')) {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const addressLine = text(record.address_line || record.address || record.line1);
  if (!addressLine) return null;
  return {
    address_line: addressLine,
    city: text(record.city || record.district),
    state: text(record.state || record.state_province),
    pincode: text(record.pincode || record.pin || record.postal_code),
    country: text(record.country) || 'India',
  };
}

export function isCompleteAddress(address: StructuredAddress | null): address is StructuredAddress {
  return Boolean(
    address && address.address_line && address.city && address.state && normalizeDelhiveryPincode(address.pincode)
  );
}

/**
 * Loads a user's name, phone and saved street address for a Delhivery booking. The address
 * comes from the structured block on their profile (registered office or home address), with
 * the profile's city, state and pincode filling any gaps in that block.
 */
export async function loadDelhiveryParty(userId: number, owner: string): Promise<DelhiveryParty> {
  const notFound = () => new Error(`Couldn't find ${owner} profile for the Delhivery booking`);
  if (!Number.isFinite(userId) || userId <= 0) throw notFound();

  const { data: user, error } = await supabase
    .from('users')
    .select('id, name, email, phone, city, state_province, pincode, country, profile_data')
    .eq('id', userId)
    .maybeSingle();
  if (error || !user) throw notFound();

  const profile = parseJsonObject(user.profile_data);
  const block = PROFILE_ADDRESS_KEYS.map((key) => readStructuredAddress(profile[key])).find(Boolean) || null;

  const name = text(user.name) || text(profile.organization_name) || text(profile.ngo_name) || text(profile.company_name);
  const phone = normalizeDelhiveryPhone(user.phone || profile.phone);
  const address = block?.address_line || '';
  const city = block?.city || text(user.city);
  const state = block?.state || text(user.state_province);
  const pincode = normalizeDelhiveryPincode(block?.pincode || user.pincode);

  const missing = (what: string) => new Error(`Add ${what} to ${owner} profile before booking Delhivery`);
  if (!name) throw missing('a name');
  if (!phone) throw missing('a valid 10-digit phone number');
  if (!address) throw missing('a street address');
  if (!city) throw missing('a city');
  if (!state) throw missing('a state');
  if (!pincode) throw missing('a valid 6-digit pincode');

  return {
    userId,
    name,
    phone,
    email: text(user.email) || null,
    address,
    city,
    state,
    pincode,
    country: block?.country || text(user.country) || 'India',
  };
}

/** Replaces the party's address with a complete structured address (for example a project site). */
export function withAddress(party: DelhiveryParty, address: StructuredAddress): DelhiveryParty {
  return {
    ...party,
    address: address.address_line,
    city: address.city,
    state: address.state,
    pincode: normalizeDelhiveryPincode(address.pincode),
    country: address.country || 'India',
  };
}

function pickupFingerprint(party: DelhiveryParty): string {
  return createHash('sha256')
    .update([party.name, party.phone, party.address, party.city, party.state, party.pincode].join('|'))
    .digest('hex')
    .slice(0, 16);
}

export function delhiveryWarehouseName(userId: number): string {
  return `Navadrishti-${userId}`;
}

/**
 * Returns the Delhivery pickup location for the sender, registering their saved address as a
 * warehouse the first time and re-registering it whenever that address changes.
 */
export async function ensureDelhiveryPickupLocation(party: DelhiveryParty): Promise<string> {
  const { data: user } = await supabase
    .from('users')
    .select('profile_data')
    .eq('id', party.userId)
    .maybeSingle();
  const profile = parseJsonObject(user?.profile_data);
  const registered = text(profile.delhivery_pickup_location);
  const registeredFingerprint = text(profile.delhivery_pickup_fingerprint);

  // A pickup location set by an admin without a fingerprint is a warehouse managed in Delhivery directly.
  if (registered && !registeredFingerprint) return registered;

  const fingerprint = pickupFingerprint(party);
  const name = delhiveryWarehouseName(party.userId);
  if (registered === name && registeredFingerprint === fingerprint) return name;

  await upsertDelhiveryWarehouse({
    name,
    phone: party.phone,
    email: party.email,
    address: party.address,
    city: party.city,
    state: party.state,
    pincode: party.pincode,
    country: party.country,
  });

  const { error } = await supabase
    .from('users')
    .update({
      profile_data: { ...profile, delhivery_pickup_location: name, delhivery_pickup_fingerprint: fingerprint },
    })
    .eq('id', party.userId);
  if (error) console.error('Failed to save Delhivery pickup location:', error);

  return name;
}
