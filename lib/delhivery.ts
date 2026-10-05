import { getErrorMessage } from '@/lib/utils';

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
  statusType: string | null;
  lastEventAt: string | null;
  lastLocation: string | null;
  events: DelhiveryEvent[];
  raw: unknown;
};

const DELHIVERY_BASE_URLS = {
  production: 'https://track.delhivery.com',
  staging: 'https://staging-express.dlv.one',
};
const DEFAULT_DELHIVERY_TIMEOUT_MS = 10000;

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function resolveBaseUrl(): string {
  const override = String(process.env.DELHIVERY_API_BASE_URL || '').trim();
  if (override) return normalizeBaseUrl(override);
  return String(process.env.DELHIVERY_ENV || '').trim().toLowerCase() === 'staging'
    ? DELHIVERY_BASE_URLS.staging
    : DELHIVERY_BASE_URLS.production;
}

function getDelhiveryConfig() {
  const token = String(process.env.DELHIVERY_API_TOKEN || '').trim();
  const timeoutMs = Number(process.env.DELHIVERY_API_TIMEOUT_MS || DEFAULT_DELHIVERY_TIMEOUT_MS);

  if (!token) {
    throw new Error('Delhivery API token is not configured');
  }

  return {
    token,
    baseUrl: resolveBaseUrl(),
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_DELHIVERY_TIMEOUT_MS,
  };
}

export function isDelhiveryConfigured(): boolean {
  return Boolean(String(process.env.DELHIVERY_API_TOKEN || '').trim());
}

type DelhiveryResponse = { ok: boolean; status: number; raw: unknown; text: string };

async function delhiveryRequest(
  path: string,
  init: { method?: 'GET' | 'POST'; body?: string; contentType?: string; action: string }
): Promise<DelhiveryResponse> {
  const { token, baseUrl, timeoutMs } = getDelhiveryConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: init.method || 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Token ${token}`,
        ...(init.contentType ? { 'Content-Type': init.contentType } : {}),
      },
      body: init.body,
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (error) {
    throw new Error(
      error instanceof Error && error.name === 'AbortError'
        ? `Delhivery ${init.action} timed out after ${timeoutMs}ms`
        : getErrorMessage(error) || `Delhivery ${init.action} request failed`
    );
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = { message: text };
  }
  return { ok: response.ok, status: response.status, raw, text };
}

const HAS_TIMEZONE = /(Z|[+-]\d{2}:?\d{2})$/i;
const LOCAL_ISO_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

// Delhivery reports scan times in IST without an offset.
function parseDate(value: unknown): string | null {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;

  const withZone = LOCAL_ISO_DATETIME.test(text) && !HAS_TIMEZONE.test(text)
    ? `${text.replace(' ', 'T')}+05:30`
    : text;
  const parsed = new Date(withZone);
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

function readPath(value: unknown, ...path: Array<string | number>): unknown {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string | number, unknown>)[key];
  }
  return current;
}

function findShipment(payload: unknown): unknown {
  const shipmentData = readPath(payload, 'ShipmentData');
  const firstShipmentData: unknown = Array.isArray(shipmentData) ? shipmentData[0] : null;
  return (
    readPath(firstShipmentData, 'Shipment') ||
    readPath(payload, 'Shipment') ||
    readPath(payload, 'shipment') ||
    readPath(payload, 'data', 'shipment') ||
    null
  );
}

function normalizeEvent(rawScan: Record<string, unknown>): DelhiveryEvent | null {
  const scanDetail = rawScan.ScanDetail;
  const scan = scanDetail && typeof scanDetail === 'object' && !Array.isArray(scanDetail)
    ? scanDetail as Record<string, unknown>
    : rawScan;

  const status = firstString([
    scan.Scan,
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
      scan.StatusDateTime,
      scan.scan_time,
      scan.timestamp,
      scan.updated_at,
      scan.time,
      scan.date
    ])
  );

  const location = firstString([
    scan.ScanLocation,
    scan.ScannedLocation,
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

function extractCandidateScans(payload: unknown): Record<string, unknown>[] {
  const shipment = findShipment(payload);

  const candidates = [
    readPath(shipment, 'Scans'),
    readPath(shipment, 'scans'),
    readPath(shipment, 'ScanDetail'),
    readPath(payload, 'Scans'),
    readPath(payload, 'scans'),
    readPath(payload, 'tracking_data'),
    readPath(payload, 'data', 'tracking_data'),
    readPath(payload, 'data', 'Scans')
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

function extractCurrentStatus(payload: unknown, events: DelhiveryEvent[]): string | null {
  const shipment = findShipment(payload);

  return firstString([
    readPath(shipment, 'Status', 'Status'),
    readPath(shipment, 'CurrentStatus'),
    readPath(shipment, 'status'),
    readPath(shipment, 'status_type'),
    readPath(payload, 'Status'),
    readPath(payload, 'status'),
    readPath(payload, 'current_status'),
    events[0]?.status
  ]);
}

function extractTrackingId(payload: unknown, fallbackTrackingId: string): string {
  const shipment = findShipment(payload);

  return (
    firstString([
      readPath(shipment, 'AWB'),
      readPath(shipment, 'Waybill'),
      readPath(payload, 'waybill'),
      readPath(payload, 'awb'),
      readPath(payload, 'tracking_id')
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
  shippingMode?: 'Surface' | 'Express';
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

export function sanitizeDelhiveryText(value: string): string {
  return String(value || '')
    .replace(/[&\\#%;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

/** Ten-digit Indian number with any +91 or trunk 0 removed, or '' when it isn't one. */
export function normalizeDelhiveryPhone(value: unknown): string {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits.length === 10 ? digits : '';
}

export function normalizeDelhiveryPincode(value: unknown): string {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 6 ? digits : '';
}

function packageRemarks(firstPackage: unknown): string | null {
  const remarks = readPath(firstPackage, 'remarks');
  if (Array.isArray(remarks)) {
    const text = remarks.map((item) => String(item || '').trim()).filter(Boolean).join('; ');
    return text || null;
  }
  return firstString([remarks]);
}

/** Looks up the waybill Delhivery already assigned to one of our order ids. */
export async function findDelhiveryWaybillByOrderId(orderId: string): Promise<string | null> {
  const { ok, raw } = await delhiveryRequest(
    `/api/v1/packages/json/?ref_ids=${encodeURIComponent(orderId)}`,
    { action: 'order lookup' }
  );
  if (!ok) return null;
  const shipment = findShipment(raw);
  return firstString([readPath(shipment, 'AWB'), readPath(shipment, 'Waybill')]);
}

export async function createDelhiveryShipment(
  input: CreateDelhiveryShipmentInput
): Promise<DelhiveryShipmentResult> {
  getDelhiveryConfig();
  const pickupLocationName = String(input.pickupLocationName || '').trim();
  if (!pickupLocationName) {
    throw new Error('Delhivery pickup location is required');
  }

  const consigneePhone = normalizeDelhiveryPhone(input.consignee.phone);
  const sellerPhone = normalizeDelhiveryPhone(input.seller.phone);
  const consigneePin = normalizeDelhiveryPincode(input.consignee.pincode);
  const sellerPin = normalizeDelhiveryPincode(input.seller.pincode);

  if (!consigneePhone) throw new Error('Consignee phone number is required for Delhivery booking');
  if (!sellerPhone) throw new Error('Pickup contact phone number is required for Delhivery booking');
  if (!consigneePin) throw new Error('Consignee pincode must be 6 digits');
  if (!sellerPin) throw new Error('Pickup pincode must be 6 digits');

  const payload = {
    pickup_location: { name: pickupLocationName },
    shipments: [
      {
        order: sanitizeDelhiveryText(input.orderId),
        order_date: new Date().toISOString(),
        name: sanitizeDelhiveryText(input.consignee.name),
        add: sanitizeDelhiveryText(input.consignee.address),
        city: sanitizeDelhiveryText(input.consignee.city),
        state: sanitizeDelhiveryText(input.consignee.state),
        country: sanitizeDelhiveryText(input.consignee.country || 'India'),
        pin: consigneePin,
        phone: consigneePhone,
        payment_mode: input.paymentMode || 'Prepaid',
        shipping_mode: input.shippingMode || 'Surface',
        weight: String(Math.max(100, Number(input.weightGrams || 500))),
        quantity: Math.max(1, Number(input.quantity || 1)),
        seller_name: sanitizeDelhiveryText(input.seller.name),
        seller_add: sanitizeDelhiveryText(input.seller.address),
        return_name: sanitizeDelhiveryText(input.seller.name),
        return_add: sanitizeDelhiveryText(input.seller.address),
        return_city: sanitizeDelhiveryText(input.seller.city),
        return_state: sanitizeDelhiveryText(input.seller.state),
        return_pin: sellerPin,
        return_phone: sellerPhone,
        return_country: sanitizeDelhiveryText(input.seller.country || 'India'),
        products_desc: sanitizeDelhiveryText(input.productDescription || 'Donated material'),
        total_amount: Math.max(1, Number(input.totalAmountInr || 1)),
      },
    ],
  };

  const { ok, status, raw, text } = await delhiveryRequest('/api/cmu/create.json', {
    method: 'POST',
    contentType: 'application/x-www-form-urlencoded',
    body: `format=json&data=${encodeURIComponent(JSON.stringify(payload))}`,
    action: 'booking',
  });

  const packages = readPath(raw, 'packages');
  const firstPackage: unknown = Array.isArray(packages) ? packages[0] : undefined;
  const remarks = packageRemarks(firstPackage);

  if (!ok) {
    throw new Error(String(remarks || readPath(raw, 'rmk') || readPath(raw, 'message') || text || `HTTP ${status}`));
  }

  const waybill = firstString([
    readPath(firstPackage, 'waybill'),
    readPath(firstPackage, 'Waybill'),
    readPath(raw, 'waybill'),
    readPath(raw, 'awb'),
  ]);

  if (!(readPath(raw, 'success') && waybill)) {
    if (remarks && /duplicate/i.test(remarks)) {
      const existing = await findDelhiveryWaybillByOrderId(input.orderId);
      if (existing) {
        return { success: true, waybill: existing, orderId: input.orderId, status: 'booked', remark: remarks, raw };
      }
    }
    throw new Error(String(remarks || readPath(raw, 'rmk') || readPath(raw, 'error') || 'Delhivery did not return a waybill'));
  }

  return {
    success: true,
    waybill,
    orderId: input.orderId,
    status: firstString([readPath(firstPackage, 'status'), readPath(raw, 'status')]) || 'booked',
    remark: remarks || firstString([readPath(raw, 'rmk'), readPath(raw, 'remark')]),
    raw,
  };
}

export type DelhiveryWarehouseInput = {
  name: string;
  phone: string;
  email?: string | null;
  address: string;
  city: string;
  state: string;
  pincode: string;
  country?: string;
};

function warehouseErrorText(raw: unknown, fallback: string): string {
  const error = readPath(raw, 'error');
  if (Array.isArray(error)) return error.map(String).join('; ') || fallback;
  return String(error || readPath(raw, 'message') || readPath(raw, 'rmk') || fallback);
}

/**
 * Registers (or refreshes) a pickup warehouse on the Delhivery account. Delhivery collects
 * every shipment from the warehouse named in pickup_location, so each sender needs their own.
 */
export async function upsertDelhiveryWarehouse(warehouse: DelhiveryWarehouseInput): Promise<void> {
  const phone = normalizeDelhiveryPhone(warehouse.phone);
  const pin = normalizeDelhiveryPincode(warehouse.pincode);
  if (!phone) throw new Error('A 10-digit phone number is required to register a Delhivery pickup address');
  if (!pin) throw new Error('A 6-digit pincode is required to register a Delhivery pickup address');

  const address = sanitizeDelhiveryText(warehouse.address);
  const city = sanitizeDelhiveryText(warehouse.city);
  const state = sanitizeDelhiveryText(warehouse.state);
  const country = sanitizeDelhiveryText(warehouse.country || 'India');

  const created = await delhiveryRequest('/api/backend/clientwarehouse/create/', {
    method: 'POST',
    contentType: 'application/json',
    body: JSON.stringify({
      name: warehouse.name,
      registered_name: warehouse.name,
      email: warehouse.email || undefined,
      phone,
      address,
      city,
      country,
      pin,
      return_address: address,
      return_pin: pin,
      return_city: city,
      return_state: state,
      return_country: country,
    }),
    action: 'warehouse registration',
  });

  if (created.ok && readPath(created.raw, 'success') !== false) return;

  const createError = warehouseErrorText(created.raw, created.text || `HTTP ${created.status}`);
  if (!/already exist/i.test(createError)) {
    throw new Error(`Delhivery could not register the pickup address: ${createError}`);
  }

  const edited = await delhiveryRequest('/api/backend/clientwarehouse/edit/', {
    method: 'POST',
    contentType: 'application/json',
    body: JSON.stringify({ name: warehouse.name, registered_name: warehouse.name, address, pin, phone }),
    action: 'warehouse update',
  });
  if (!edited.ok || readPath(edited.raw, 'success') === false) {
    throw new Error(
      `Delhivery could not update the pickup address: ${warehouseErrorText(edited.raw, edited.text || `HTTP ${edited.status}`)}`
    );
  }
}

export type DelhiveryPincodeService = {
  pincode: string;
  serviceable: boolean | null;
  prepaid: boolean;
  pickup: boolean;
};

/** Delhivery serviceability for a pincode; serviceable is null when Delhivery couldn't be asked. */
export async function checkDelhiveryPincode(pincodeInput: string): Promise<DelhiveryPincodeService> {
  const pincode = normalizeDelhiveryPincode(pincodeInput);
  if (!pincode) return { pincode: String(pincodeInput || ''), serviceable: false, prepaid: false, pickup: false };

  let response: DelhiveryResponse;
  try {
    response = await delhiveryRequest(`/c/api/pin-codes/json/?filter_codes=${pincode}`, { action: 'pincode check' });
  } catch {
    return { pincode, serviceable: null, prepaid: false, pickup: false };
  }
  if (!response.ok) return { pincode, serviceable: null, prepaid: false, pickup: false };

  const codes = readPath(response.raw, 'delivery_codes');
  const postal = Array.isArray(codes) ? readPath(codes[0], 'postal_code') : undefined;
  if (!postal) return { pincode, serviceable: false, prepaid: false, pickup: false };

  const flag = (key: string) => String(readPath(postal, key) || '').toUpperCase() !== 'N';
  return { pincode, serviceable: true, prepaid: flag('pre_paid'), pickup: flag('pickup') };
}

/** Throws a readable error when Delhivery says it can't collect from or deliver to these pincodes. */
export async function assertDelhiveryRouteServiceable(pickupPincode: string, deliveryPincode: string): Promise<void> {
  const [pickup, delivery] = await Promise.all([
    checkDelhiveryPincode(pickupPincode),
    checkDelhiveryPincode(deliveryPincode),
  ]);
  if (pickup.serviceable === false || (pickup.serviceable && !pickup.pickup)) {
    throw new Error(`Delhivery does not collect from pincode ${pickup.pincode}`);
  }
  if (delivery.serviceable === false || (delivery.serviceable && !delivery.prepaid)) {
    throw new Error(`Delhivery does not deliver to pincode ${delivery.pincode}`);
  }
}

async function fetchTrackingPayload(trackingId: string): Promise<unknown> {
  const { ok, status, raw, text } = await delhiveryRequest(
    `/api/v1/packages/json/?waybill=${encodeURIComponent(trackingId)}`,
    { action: 'tracking' }
  );
  if (!ok) {
    throw new Error(text || `HTTP ${status}` || 'Unable to fetch Delhivery tracking details');
  }
  return raw;
}

export async function getDelhiveryTrackingSnapshot(trackingIdInput: string): Promise<DelhiveryTrackingSnapshot> {
  const trackingId = String(trackingIdInput || '').trim();
  if (!trackingId) {
    throw new Error('Tracking ID is required');
  }

  const payload = await fetchTrackingPayload(trackingId);
  const shipment = findShipment(payload);
  if (readPath(payload, 'Error') || (!shipment && readPath(payload, 'ShipmentData') === undefined)) {
    const message = firstString([readPath(payload, 'Error'), readPath(payload, 'message')]);
    if (message) throw new Error(message);
  }

  const rawScans = extractCandidateScans(payload);
  const events = sortEventsDesc(
    rawScans
      .map((scan) => normalizeEvent(scan))
      .filter((event: DelhiveryEvent | null): event is DelhiveryEvent => Boolean(event))
  );

  const currentStatus = extractCurrentStatus(payload, events);
  const lastEvent = events[0] || null;

  return {
    provider: 'delhivery',
    trackingId: extractTrackingId(payload, trackingId),
    currentStatus,
    statusType: firstString([readPath(shipment, 'Status', 'StatusType')]),
    lastEventAt: lastEvent?.timestamp || null,
    lastLocation: lastEvent?.location || null,
    events,
    raw: payload
  };
}
