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

export function DelhiveryPartyFields({
  title,
  hint,
  value,
  onChange,
  readOnly,
}: {
  title: string;
  hint?: string;
  value: DelhiveryPartyForm;
  onChange?: (next: DelhiveryPartyForm) => void;
  readOnly?: boolean;
}) {
  const set = (key: keyof DelhiveryPartyForm, next: string) => {
    onChange?.({ ...value, [key]: next });
  };

  return (
    <div className="space-y-2 rounded-md border border-indigo-100 bg-white p-3">
      <div>
        <p className="text-sm font-medium text-slate-900">{title}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Contact name</Label>
          <Input value={value.name} onChange={(event) => set('name', event.target.value)} readOnly={readOnly} disabled={readOnly} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Phone</Label>
          <Input value={value.phone} onChange={(event) => set('phone', event.target.value)} readOnly={readOnly} disabled={readOnly} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Street address</Label>
          <Input value={value.address} onChange={(event) => set('address', event.target.value)} readOnly={readOnly} disabled={readOnly} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">City</Label>
          <Input value={value.city} onChange={(event) => set('city', event.target.value)} readOnly={readOnly} disabled={readOnly} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">State</Label>
          <Input value={value.state} onChange={(event) => set('state', event.target.value)} readOnly={readOnly} disabled={readOnly} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Pincode</Label>
          <Input value={value.pincode} onChange={(event) => set('pincode', event.target.value)} readOnly={readOnly} disabled={readOnly} />
        </div>
      </div>
    </div>
  );
}
