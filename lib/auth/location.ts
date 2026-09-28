import { readNgoTextField } from './normalize';

export const INDIAN_STATES_AND_UTS = [
  'Andaman and Nicobar Islands',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Lakshadweep',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
] as const;

export type NgoHeadquartersLocation = {
  address_line: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
};

type HeadquartersLocationInput = {
  address_line?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
};

export function normalizePincode(value: string, country = 'India'): string {
  const digits = String(value || '').replace(/\D/g, '');
  if (country === 'India') {
    return digits.slice(0, 6);
  }
  return digits.slice(0, 12);
}

export function isValidIndianPincode(value: string): boolean {
  return /^\d{6}$/.test(normalizePincode(value, 'India'));
}

export function buildNgoLocationDisplay(location: Partial<NgoHeadquartersLocation>): string {
  return [
    location.address_line,
    location.city,
    location.state,
    location.pincode,
    location.country,
  ]
    .map((part) => readNgoTextField(part))
    .filter(Boolean)
    .join(', ');
}

export function validateNgoHeadquartersLocation(input: HeadquartersLocationInput): string | null {
  return validateHeadquartersLocation(input, 'NGO');
}

export function validateCompanyHeadquartersLocation(input: HeadquartersLocationInput): string | null {
  return validateHeadquartersLocation(input, 'Company');
}

function validateHeadquartersLocation(input: HeadquartersLocationInput, entityLabel: string): string | null {
  const addressLine = readNgoTextField(input.address_line);
  const city = readNgoTextField(input.city);
  const state = readNgoTextField(input.state);
  const country = readNgoTextField(input.country) || 'India';
  const pincode = normalizePincode(String(input.pincode || ''), country);

  if (!addressLine) {
    return `Registered office address is required for ${entityLabel} location.`;
  }

  if (!city) {
    return `City is required for ${entityLabel} location.`;
  }

  if (!state) {
    return `State / UT is required for ${entityLabel} location.`;
  }

  if (!pincode) {
    return `Pincode is required for ${entityLabel} location.`;
  }

  if (country === 'India' && !isValidIndianPincode(pincode)) {
    return `Enter a valid 6-digit Indian pincode for ${entityLabel} location.`;
  }

  if (country === 'India' && !INDIAN_STATES_AND_UTS.some((item) => item.toLowerCase() === state.toLowerCase())) {
    return `Select a valid Indian state or UT for ${entityLabel} location.`;
  }

  return null;
}
