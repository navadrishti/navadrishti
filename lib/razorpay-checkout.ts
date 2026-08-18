export type RazorpaySuccessResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

export type OpenRazorpayCheckoutOptions = {
  keyId: string;
  orderId: string;
  amountInr: number;
  currency?: string;
  name?: string;
  description?: string;
  image?: string;
  themeColor?: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  /** Close app dialogs/modals before checkout opens (e.g. setDialogOpen(false)). */
  onBeforeOpen?: () => void;
  onSuccess: (response: RazorpaySuccessResponse) => void | Promise<void>;
  onDismiss?: () => void;
  onFailure?: (error: { description?: string; reason?: string }) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, handler: (payload: unknown) => void) => void;
    };
  }
}

let scriptPromise: Promise<void> | null = null;
let cachedLocalLogoDataUrl: string | null | undefined;

const DEFAULT_LOGO_PATH = '/photos/razorpay-logo.png';
const DEFAULT_MERCHANT_NAME = 'Navadrishti LLP';

function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

function getPublicAppOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || '';
  if (typeof window === 'undefined') {
    return configured;
  }

  const { origin, hostname } = window.location;
  if (isLocalHostname(hostname) && configured) {
    return configured;
  }

  return origin || configured;
}

function buildPublicLogoUrl(image?: string): string | undefined {
  const path = image || DEFAULT_LOGO_PATH;
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const origin = getPublicAppOrigin();
  if (!origin) {
    return path;
  }

  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}

async function loadLocalLogoDataUrl(image?: string): Promise<string | undefined> {
  if (typeof window === 'undefined') {
    return undefined;
  }

  if (cachedLocalLogoDataUrl !== undefined) {
    return cachedLocalLogoDataUrl || undefined;
  }

  const path = image || DEFAULT_LOGO_PATH;
  try {
    const response = await fetch(path);
    if (!response.ok) {
      cachedLocalLogoDataUrl = null;
      return undefined;
    }

    const blob = await response.blob();
    cachedLocalLogoDataUrl = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });

    return cachedLocalLogoDataUrl || undefined;
  } catch {
    cachedLocalLogoDataUrl = null;
    return undefined;
  }
}

/** Razorpay checkout needs a reachable logo URL (PNG/JPG/WebP). Localhost URLs fail on Razorpay servers. */
export async function resolveRazorpayCheckoutImageUrl(image?: string): Promise<string | undefined> {
  if (typeof window !== 'undefined' && isLocalHostname(window.location.hostname)) {
    const localDataUrl = await loadLocalLogoDataUrl(image);
    if (localDataUrl) {
      return localDataUrl;
    }
  }

  const configured = process.env.NEXT_PUBLIC_RAZORPAY_LOGO_URL?.trim();
  if (configured) {
    return configured;
  }

  return buildPublicLogoUrl(image);
}

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

/** Remove Radix dialog/sheet overlays that stack under Razorpay and black out the page. */
export function clearBlockingAppOverlays(): void {
  if (typeof document === 'undefined') {
    return;
  }

  document.body.style.pointerEvents = '';
  document.body.style.overflow = '';
  document.body.removeAttribute('data-scroll-locked');

  const overlaySelectors = [
    '[data-radix-dialog-overlay]',
    '[data-radix-alert-dialog-overlay]',
  ];

  overlaySelectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((node) => {
      node.parentElement?.removeChild(node);
    });
  });

  document.querySelectorAll('[role="dialog"][data-state="open"]').forEach((node) => {
    const element = node as HTMLElement;
    element.setAttribute('data-state', 'closed');
    element.style.display = 'none';
  });
}

export function loadRazorpayScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Razorpay can only load in the browser'));
  }

  if (window.Razorpay) {
    return Promise.resolve();
  }

  if (scriptPromise) {
    return scriptPromise;
  }

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-razorpay-checkout="true"]');
    if (existing) {
      if (window.Razorpay) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => {
          scriptPromise = null;
          reject(new Error('Failed to load Razorpay checkout'));
        },
        { once: true }
      );
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.dataset.razorpayCheckout = 'true';
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Failed to load Razorpay checkout'));
    };
    document.body.appendChild(script);
  });

  return scriptPromise;
}

export async function openRazorpayCheckout(options: OpenRazorpayCheckoutOptions): Promise<void> {
  if (!options.orderId?.trim()) {
    throw new Error('Payment order is missing. Please try again.');
  }

  const amountPaise = Math.round(Number(options.amountInr) * 100);
  if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
    throw new Error('Invalid payment amount.');
  }

  await loadRazorpayScript();

  if (!window.Razorpay) {
    throw new Error('Razorpay failed to load. Please refresh and try again.');
  }

  if (!options.keyId?.trim()) {
    throw new Error('Razorpay key is missing. Check NEXT_PUBLIC_RAZORPAY_KEY_ID.');
  }

  options.onBeforeOpen?.();
  await waitForNextPaint();
  clearBlockingAppOverlays();

  const checkoutImage = await resolveRazorpayCheckoutImageUrl(options.image);

  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearBlockingAppOverlays();
      resolve();
    };

    const razorpay = new window.Razorpay!({
      key: options.keyId,
      amount: amountPaise,
      currency: options.currency || 'INR',
      name: options.name || DEFAULT_MERCHANT_NAME,
      description: options.description || 'Payment',
      image: checkoutImage,
      order_id: options.orderId,
      prefill: options.prefill || {},
      theme: { color: options.themeColor || '#2563eb' },
      modal: {
        ondismiss: () => {
          clearBlockingAppOverlays();
          options.onDismiss?.();
          finish();
        },
        escape: true,
        backdropclose: true,
        confirm_close: false,
        animation: true,
        handleback: true,
      },
      retry: {
        enabled: true,
        max_count: 3,
      },
      handler: async (response: RazorpaySuccessResponse) => {
        try {
          await options.onSuccess(response);
        } finally {
          finish();
        }
      },
    });

    razorpay.on('payment.failed', (payload: unknown) => {
      const failure = payload as { error?: { description?: string; reason?: string } };
      options.onFailure?.({
        description: failure?.error?.description,
        reason: failure?.error?.reason,
      });
    });

    clearBlockingAppOverlays();
    razorpay.open();
  });
}
