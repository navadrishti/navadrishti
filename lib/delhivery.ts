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
