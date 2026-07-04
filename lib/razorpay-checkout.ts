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

  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const razorpay = new window.Razorpay!({
      key: options.keyId,
      amount: amountPaise,
      currency: options.currency || 'INR',
      name: options.name || 'Navadrishti',
      description: options.description || 'Payment',
      image: options.image || '/photos/small-logo.svg',
      order_id: options.orderId,
      prefill: options.prefill || {},
      theme: { color: options.themeColor || '#2563eb' },
      modal: {
        ondismiss: () => {
          options.onDismiss?.();
          finish();
        },
        escape: true,
        backdropclose: true,
        confirm_close: true,
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

    razorpay.open();
  });
}
