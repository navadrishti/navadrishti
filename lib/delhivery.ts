type DelhiveryEvent = {
  status: string;
  timestamp: string | null;
  location: string | null;
  details: string | null;
};

export type DelhiveryTrackingSnapshot = {
  provider: 'delhivery';
  trackingId: string;
  currentStatus: string | null;
  lastEventAt: string | null;
  lastLocation: string | null;
  events: DelhiveryEvent[];
  raw: unknown;
};

const DEFAULT_DELHIVERY_API_BASE = 'https://track.delhivery.com';
const DEFAULT_DELHIVERY_TIMEOUT_MS = 10000;

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

export function isDelhiveryConfigured(): boolean {
  return Boolean(process.env.DELHIVERY_API_TOKEN);
}

function getDelhiveryConfig() {
  const token = String(process.env.DELHIVERY_API_TOKEN || '').trim();
  const baseUrl = normalizeBaseUrl(String(process.env.DELHIVERY_API_BASE_URL || DEFAULT_DELHIVERY_API_BASE).trim());
  const timeoutMs = Number(process.env.DELHIVERY_API_TIMEOUT_MS || DEFAULT_DELHIVERY_TIMEOUT_MS);

  if (!token) {
    throw new Error('Delhivery API token is not configured');
  }

  return {
    token,
    baseUrl,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_DELHIVERY_TIMEOUT_MS,
  };
}

function buildHeaders(token: string): HeadersInit {
  return {
    Accept: 'application/json',
    Authorization: `Token ${token}`,
    'X-API-Key': token,
    'x-api-key': token
  };
}

function parseDate(value: unknown): string | null {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return text;
}

function firstString(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function normalizeEvent(scan: Record<string, any>): DelhiveryEvent | null {
  const status = firstString([
    scan.ScanType,
    scan.status,
    scan.Status,
    scan.status_type,
    scan.Instructions,
    scan.Remarks,
    scan.remark
  ]);

  const timestamp = parseDate(
    firstString([
      scan.ScanDateTime,
      scan.scan_time,
      scan.timestamp,
      scan.updated_at,
      scan.time,
      scan.date
    ])
  );

  const location = firstString([
    scan.ScanLocation,
    scan.location,
    scan.city,
    scan.Location,
    scan.location_name
  ]);

  const details = firstString([
    scan.Instructions,
    scan.Remarks,
    scan.remark,
    scan.description,
    scan.StatusDescription
  ]);

  if (!status && !timestamp && !location && !details) {
    return null;
  }

  return {
    status: status || 'Update',
    timestamp,
    location,
    details
  };
}

function extractCandidateScans(payload: any): any[] {
  const shipmentData = Array.isArray(payload?.ShipmentData) ? payload.ShipmentData[0] : null;
  const shipment = shipmentData?.Shipment || payload?.Shipment || payload?.shipment || payload?.data?.shipment || null;

  const candidates = [
    shipment?.Scans,
    shipment?.scans,
    shipment?.ScanDetail,
    payload?.Scans,
    payload?.scans,
    payload?.tracking_data,
    payload?.data?.tracking_data,
    payload?.data?.Scans
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

function sortEventsDesc(events: DelhiveryEvent[]): DelhiveryEvent[] {
  return [...events].sort((a, b) => {
    const aTime = a.timestamp ? Date.parse(a.timestamp) : 0;
    const bTime = b.timestamp ? Date.parse(b.timestamp) : 0;
    return bTime - aTime;
  });
}

function extractCurrentStatus(payload: any, events: DelhiveryEvent[]): string | null {
  const shipmentData = Array.isArray(payload?.ShipmentData) ? payload.ShipmentData[0] : null;
  const shipment = shipmentData?.Shipment || payload?.Shipment || payload?.shipment || payload?.data?.shipment || null;

  return firstString([
    shipment?.Status?.Status,
    shipment?.CurrentStatus,
    shipment?.status,
    shipment?.status_type,
    payload?.Status,
    payload?.status,
    payload?.current_status,
    events[0]?.status
  ]);
}

function extractTrackingId(payload: any, fallbackTrackingId: string): string {
  const shipmentData = Array.isArray(payload?.ShipmentData) ? payload.ShipmentData[0] : null;
  const shipment = shipmentData?.Shipment || payload?.Shipment || payload?.shipment || payload?.data?.shipment || null;

  return (
    firstString([
      shipment?.AWB,
      shipment?.Waybill,
      payload?.waybill,
      payload?.awb,
      payload?.tracking_id
    ]) || fallbackTrackingId
  );
}

export type DelhiveryPartyAddress = {
  name: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  country?: string;
};

export type CreateDelhiveryShipmentInput = {
  orderId: string;
  pickupLocationName: string;
  consignee: DelhiveryPartyAddress;
  seller: DelhiveryPartyAddress;
  paymentMode?: 'Prepaid' | 'COD';
  weightGrams?: number;
  quantity?: number;
  productDescription?: string;
  totalAmountInr?: number;
};

export type DelhiveryShipmentResult = {
  success: boolean;
  waybill: string | null;
  orderId: string;
  status: string | null;
  remark: string | null;
  raw: unknown;
};

export function isDelhiveryBookingConfigured(): boolean {
  return Boolean(process.env.DELHIVERY_API_TOKEN && process.env.DELHIVERY_PICKUP_LOCATION_NAME);
}

export function sanitizeDelhiveryText(value: string): string {
  return String(value || '')
    .replace(/[&\\#%;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

function normalizeDelhiveryPhone(value: unknown): string {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return digits;
}

function normalizeDelhiveryPincode(value: unknown): string {
  return String(value || '').replace(/\D/g, '').slice(0, 6);
}

export async function createDelhiveryShipment(
  input: CreateDelhiveryShipmentInput
): Promise<DelhiveryShipmentResult> {
  const { token, baseUrl, timeoutMs } = getDelhiveryConfig();
  const pickupLocationName = String(input.pickupLocationName || process.env.DELHIVERY_PICKUP_LOCATION_NAME || '').trim();
  if (!pickupLocationName) {
    throw new Error('DELHIVERY_PICKUP_LOCATION_NAME is not configured');
  }

  const consigneePhone = normalizeDelhiveryPhone(input.consignee.phone);
  const sellerPhone = normalizeDelhiveryPhone(input.seller.phone);
  const consigneePin = normalizeDelhiveryPincode(input.consignee.pincode);
  const sellerPin = normalizeDelhiveryPincode(input.seller.pincode);

  if (consigneePhone.length < 10) throw new Error('Consignee phone number is required for Delhivery booking');
  if (sellerPhone.length < 10) throw new Error('Pickup contact phone number is required for Delhivery booking');
  if (consigneePin.length !== 6) throw new Error('Consignee pincode must be 6 digits');
  if (sellerPin.length !== 6) throw new Error('Pickup pincode must be 6 digits');

  const payload = {
    pickup_location: { name: pickupLocationName },
    shipments: [
      {
        order: sanitizeDelhiveryText(input.orderId),
        name: sanitizeDelhiveryText(input.consignee.name),
        add: sanitizeDelhiveryText(input.consignee.address),
        city: sanitizeDelhiveryText(input.consignee.city),
        state: sanitizeDelhiveryText(input.consignee.state),
        country: sanitizeDelhiveryText(input.consignee.country || 'India'),
        pin: consigneePin,
        phone: consigneePhone,
        payment_mode: input.paymentMode || 'Prepaid',
        weight: String(Math.max(100, Number(input.weightGrams || 500))),
        quantity: Math.max(1, Number(input.quantity || 1)),
        seller_name: sanitizeDelhiveryText(input.seller.name),
        seller_add: sanitizeDelhiveryText(input.seller.address),
        return_add: sanitizeDelhiveryText(input.seller.address),
        return_city: sanitizeDelhiveryText(input.seller.city),
        return_state: sanitizeDelhiveryText(input.seller.state),
        return_pin: sellerPin,
        return_phone: sellerPhone,
        return_country: sanitizeDelhiveryText(input.seller.country || 'India'),
        products_desc: sanitizeDelhiveryText(input.productDescription || 'CSR capability material'),
        total_amount: Math.max(1, Number(input.totalAmountInr || 1)),
      },
    ],
  };

  const requestBody = `format=json&data=${JSON.stringify(payload)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/cmu/create.json`, {
      method: 'POST',
      headers: {
        ...buildHeaders(token),
        'Content-Type': 'application/json',
      },
      body: requestBody,
      signal: controller.signal,
    });
  } catch (error: any) {
    clearTimeout(timeout);
    throw new Error(
      error?.name === 'AbortError'
        ? `Delhivery booking timed out after ${timeoutMs}ms`
        : error?.message || 'Delhivery booking request failed'
    );
  }
  clearTimeout(timeout);

  const rawText = await response.text();
  let raw: any;
  try {
    raw = JSON.parse(rawText);
  } catch {
    raw = { message: rawText };
  }

  if (!response.ok) {
    throw new Error(String(raw?.rmk || raw?.message || rawText || `HTTP ${response.status}`));
  }

  const packages = Array.isArray(raw?.packages) ? raw.packages : [];
  const firstPackage = packages[0] && typeof packages[0] === 'object' ? packages[0] : {};
  const waybill = firstString([
    firstPackage?.waybill,
    firstPackage?.Waybill,
    raw?.waybill,
    raw?.awb,
  ]);
  const success = Boolean(raw?.success) && Boolean(waybill);

  if (!success) {
    throw new Error(String(raw?.rmk || raw?.error || 'Delhivery did not return a waybill'));
  }

  return {
    success: true,
    waybill: waybill || null,
    orderId: input.orderId,
    status: firstString([firstPackage?.status, raw?.status]) || 'booked',
    remark: firstString([raw?.rmk, raw?.remark]),
    raw,
  };
}

async function fetchTrackingPayload(trackingId: string): Promise<unknown> {
  const { token, baseUrl, timeoutMs } = getDelhiveryConfig();

  const endpoints = [
    `${baseUrl}/api/v1/packages/json/?waybill=${encodeURIComponent(trackingId)}`,
    `${baseUrl}/api/v1/packages/json/?verbose=2&waybill=${encodeURIComponent(trackingId)}`
  ];

  let lastError: string | null = null;

  for (const url of endpoints) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: buildHeaders(token),
        cache: 'no-store',
        signal: controller.signal,
      });
    } catch (error: any) {
      clearTimeout(timeout);
      lastError = error?.name === 'AbortError'
        ? `Delhivery tracking timed out after ${timeoutMs}ms`
        : (error?.message || 'Delhivery request failed');
      continue;
    }
    clearTimeout(timeout);

    if (!response.ok) {
      const text = await response.text();
      lastError = text || `HTTP ${response.status}`;
      continue;
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return response.json();
    }

    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return { message: text };
    }
  }

  throw new Error(lastError || 'Unable to fetch Delhivery tracking details');
}

export async function getDelhiveryTrackingSnapshot(trackingIdInput: string): Promise<DelhiveryTrackingSnapshot> {
  const trackingId = String(trackingIdInput || '').trim();
  if (!trackingId) {
    throw new Error('Tracking ID is required');
  }

  const payload = await fetchTrackingPayload(trackingId);

  const rawScans = extractCandidateScans(payload as any);
  const events = sortEventsDesc(
    rawScans
      .map((scan: any) => normalizeEvent(scan))
      .filter((event: DelhiveryEvent | null): event is DelhiveryEvent => Boolean(event))
  );

  const currentStatus = extractCurrentStatus(payload as any, events);
  const lastEvent = events[0] || null;

  return {
    provider: 'delhivery',
    trackingId: extractTrackingId(payload as any, trackingId),
    currentStatus,
    lastEventAt: lastEvent?.timestamp || null,
    lastLocation: lastEvent?.location || null,
    events,
    raw: payload
  };
}
