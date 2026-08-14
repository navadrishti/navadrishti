import {
  INDIAN_STATES_AND_UTS,
  buildNgoLocationDisplay,
  normalizePincode,
} from '@/lib/auth';

function readTextField(value: unknown): string {
  return String(value ?? '').trim();
}

export type ProjectExactAddress = {
  address_line: string;
  region: string;
  district: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
};

export const EMPTY_PROJECT_ADDRESS: ProjectExactAddress = {
  address_line: '',
  region: '',
  district: '',
  city: '',
  state: '',
  pincode: '',
  country: 'India',
};

function normalizeProjectAddress(input: Partial<ProjectExactAddress>): ProjectExactAddress {
  const country = readTextField(input.country) || 'India';
  return {
    address_line: readTextField(input.address_line),
    region: readTextField(input.region),
    district: readTextField(input.district),
    city: readTextField(input.city),
    state: readTextField(input.state),
    pincode: normalizePincode(String(input.pincode || ''), country),
    country,
  };
}

export function parseProjectExactAddress(raw: unknown): ProjectExactAddress {
  if (!raw) return { ...EMPTY_PROJECT_ADDRESS };

  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return normalizeProjectAddress(raw as Partial<ProjectExactAddress>);
  }

  const text = String(raw).trim();
  if (!text) return { ...EMPTY_PROJECT_ADDRESS };

  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return normalizeProjectAddress(parsed as Partial<ProjectExactAddress>);
      }
    } catch {
      // Fall through to legacy plain-text handling.
    }
  }

  return normalizeProjectAddress({
    address_line: text,
    city: text.includes(',') ? text.split(',')[0]?.trim() || text : text,
  });
}

export function serializeProjectExactAddress(input: Partial<ProjectExactAddress>): string {
  return JSON.stringify(normalizeProjectAddress(input));
}

export function formatProjectExactAddress(raw: unknown): string {
  const address = parseProjectExactAddress(raw);
  const formatted = [
    address.address_line,
    address.region,
    address.district,
    address.city,
    address.state,
    address.pincode,
    address.country,
  ]
    .map((part) => readTextField(part))
    .filter(Boolean)
    .join(', ');

  return formatted || 'Not set';
}

export function validateProjectExactAddress(input: Partial<ProjectExactAddress>): string | null {
  const address = normalizeProjectAddress(input);

  if (!address.address_line) {
    return 'Street / building address is required.';
  }
  if (!address.city) {
    return 'City / town is required.';
  }
  if (!address.state) {
    return 'State / UT is required.';
  }
  if (!address.pincode) {
    return 'Pincode is required.';
  }

  if (address.country === 'India') {
    if (!/^\d{6}$/.test(address.pincode)) {
      return 'Enter a valid 6-digit Indian pincode.';
    }
    if (!INDIAN_STATES_AND_UTS.some((item) => item.toLowerCase() === address.state.toLowerCase())) {
      return 'Select a valid Indian state or UT.';
    }
  }

  return null;
}

export function projectAddressToLocationSummary(address: Partial<ProjectExactAddress>): string {
  const normalized = normalizeProjectAddress(address);
  return buildNgoLocationDisplay({
    address_line: normalized.city,
    city: normalized.city,
    state: normalized.state,
    pincode: normalized.pincode,
    country: normalized.country,
  });
}

export function toProjectAddressDateInput(value: unknown): string {
  const text = String(value || '').trim();
  if (!text) return '';
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}
