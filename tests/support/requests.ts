import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'

export function tokenFor(id: number, userType: string) {
  return jwt.sign({ id, email: `user${id}@example.org`, user_type: userType }, 'test-secret')
}

export function jsonRequest(url: string, options: { token?: string; body?: unknown; method?: string } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (options.token) headers.authorization = `Bearer ${options.token}`
  return new NextRequest(url, {
    method: options.method || (options.body === undefined ? 'GET' : 'POST'),
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  })
}

export function razorpaySignature(orderId: string, paymentId: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex')
}
