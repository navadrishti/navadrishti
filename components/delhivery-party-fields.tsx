'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { PublicDelhiveryParty } from '@/lib/delhivery-parties';

export type DelhiveryPartyForm = {
  name: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
};

export function emptyDelhiveryPartyForm(): DelhiveryPartyForm {
  return { name: '', phone: '', address: '', city: '', state: '', pincode: '' };
}

export function partyToForm(party: PublicDelhiveryParty | null | undefined): DelhiveryPartyForm {
  return {
    name: String(party?.name || ''),
    phone: String(party?.phone || ''),
    address: String(party?.address || ''),
    city: String(party?.city || ''),
    state: String(party?.state || ''),
    pincode: String(party?.pincode || ''),
  };
}

export function partyFormToOverride(form: DelhiveryPartyForm) {
  return {
    name: form.name.trim(),
    phone: form.phone.trim(),
    address_line: form.address.trim(),
    city: form.city.trim(),
    state: form.state.trim(),
    pincode: form.pincode.trim(),
    country: 'India',
  };
}

const PARTY_FIELD_LABELS: Record<keyof DelhiveryPartyForm, string> = {
  name: 'contact name',
  phone: '10-digit phone',
  address: 'street address',
  city: 'city',
  state: 'state',
  pincode: '6-digit pincode',
};

function digits(value: string) {
  return value.replace(/\D/g, '');
}

function hasTenDigitPhone(value: string) {
  let phone = digits(value);
  if (phone.length === 12 && phone.startsWith('91')) phone = phone.slice(2);
  if (phone.length === 11 && phone.startsWith('0')) phone = phone.slice(1);
  return phone.length === 10;
}

export function incompleteDelhiveryPartyFields(form: DelhiveryPartyForm): Array<keyof DelhiveryPartyForm> {
  const missing: Array<keyof DelhiveryPartyForm> = [];
  if (!form.name.trim()) missing.push('name');
  if (!hasTenDigitPhone(form.phone)) missing.push('phone');
  if (!form.address.trim()) missing.push('address');
  if (!form.city.trim()) missing.push('city');
  if (!form.state.trim()) missing.push('state');
  if (digits(form.pincode).length !== 6) missing.push('pincode');
  return missing;
}

export function isCompleteDelhiveryPartyForm(form: DelhiveryPartyForm) {
  return incompleteDelhiveryPartyFields(form).length === 0;
}

export function describeIncompleteDelhiveryParty(label: string, form: DelhiveryPartyForm) {
  const missing = incompleteDelhiveryPartyFields(form);
  if (missing.length === 0) return null;
  return `Add ${missing.map((field) => PARTY_FIELD_LABELS[field]).join(', ')} on ${label}.`;
}

export function DelhiveryPartyFields({
  title,
  hint,
  value,
  onChange,
  readOnly,
  highlightMissing,
}: {
  title: string;
  hint?: string;
  value: DelhiveryPartyForm;
  onChange?: (next: DelhiveryPartyForm) => void;
  readOnly?: boolean;
  highlightMissing?: boolean;
}) {
  const set = (key: keyof DelhiveryPartyForm, next: string) => {
    onChange?.({ ...value, [key]: next });
  };
  const missing = new Set(highlightMissing ? incompleteDelhiveryPartyFields(value) : []);
  const fieldClass = (key: keyof DelhiveryPartyForm) =>
    missing.has(key) ? 'border-red-300 focus-visible:ring-red-400' : undefined;

  return (
    <div className="space-y-2 rounded-md border border-indigo-100 bg-white p-3">
      <div>
        <p className="text-sm font-medium text-slate-900">{title}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Contact name</Label>
          <Input className={fieldClass('name')} value={value.name} onChange={(event) => set('name', event.target.value)} readOnly={readOnly} disabled={readOnly} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Phone</Label>
          <Input className={fieldClass('phone')} value={value.phone} onChange={(event) => set('phone', event.target.value)} readOnly={readOnly} disabled={readOnly} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Street address</Label>
          <Input className={fieldClass('address')} value={value.address} onChange={(event) => set('address', event.target.value)} readOnly={readOnly} disabled={readOnly} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">City</Label>
          <Input className={fieldClass('city')} value={value.city} onChange={(event) => set('city', event.target.value)} readOnly={readOnly} disabled={readOnly} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">State</Label>
          <Input className={fieldClass('state')} value={value.state} onChange={(event) => set('state', event.target.value)} readOnly={readOnly} disabled={readOnly} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Pincode</Label>
          <Input className={fieldClass('pincode')} value={value.pincode} onChange={(event) => set('pincode', event.target.value)} readOnly={readOnly} disabled={readOnly} />
        </div>
      </div>
    </div>
  );
}
