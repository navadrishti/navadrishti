import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openRazorpayCheckout } from '@/lib/razorpay-checkout'
import { mockFetch } from './helpers'

type CheckoutOptions = { handler: (response: Record<string, string>) => Promise<void>; modal: { ondismiss: () => void } }

let lastOptions: CheckoutOptions | null = null

beforeEach(() => {
  lastOptions = null
  mockFetch(() => new Response(null, { status: 404 }))
  window.Razorpay = vi.fn(function (this: unknown, options: Record<string, unknown>) {
    lastOptions = options as unknown as CheckoutOptions
    return { open: vi.fn(), on: vi.fn() }
  }) as unknown as typeof window.Razorpay
})

afterEach(() => {
  delete window.Razorpay
  vi.unstubAllGlobals()
})

async function openAndPay(onSuccess: () => Promise<void>) {
  const checkout = openRazorpayCheckout({ keyId: 'key', orderId: 'order_1', amountInr: 100, onSuccess })
  await vi.waitFor(() => expect(lastOptions).not.toBeNull())
  void lastOptions!.handler({ razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_1', razorpay_signature: 'sig' })
  return checkout
}

describe('openRazorpayCheckout', () => {
  it('resolves once the success handler finishes', async () => {
    const onSuccess = vi.fn(async () => {})
    await expect(openAndPay(onSuccess)).resolves.toBeUndefined()
    expect(onSuccess).toHaveBeenCalledWith({ razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_1', razorpay_signature: 'sig' })
  })

  it('rejects with the error thrown while verifying the payment', async () => {
    await expect(openAndPay(async () => {
      throw new Error('Payment verification failed')
    })).rejects.toThrow('Payment verification failed')
  })

  it('resolves when the checkout is dismissed', async () => {
    const checkout = openRazorpayCheckout({ keyId: 'key', orderId: 'order_1', amountInr: 100, onSuccess: vi.fn() })
    await vi.waitFor(() => expect(lastOptions).not.toBeNull())
    lastOptions!.modal.ondismiss()
    await expect(checkout).resolves.toBeUndefined()
  })
})
