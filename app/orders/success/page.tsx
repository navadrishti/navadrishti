'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle, Package, Home, ShoppingBag } from 'lucide-react'
import confetti from 'canvas-confetti'

function OrderSuccessContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const orderNumber = searchParams.get('order')
  const [showConfetti, setShowConfetti] = useState(true)

  // Trigger confetti animation
  useEffect(() => {
    if (showConfetti) {
      // First burst
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      })

      // Second burst after delay
      setTimeout(() => {
        confetti({
          particleCount: 50,
          spread: 50,
          origin: { y: 0.4 }
        })
      }, 300)

      setShowConfetti(false)
    }
  }, [showConfetti])

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center w-24 h-24 rounded-full bg-green-100 mb-8">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>
          
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Order Placed Successfully!
          </h1>
          
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Thank you for your purchase! Your order has been confirmed and we'll send you shipping updates soon.
          </p>

          {orderNumber && (
            <div className="mb-8">
              <p className="text-lg text-gray-700 mb-2">Your order number is:</p>
              <p className="text-2xl font-bold text-blue-600 bg-blue-50 inline-block px-4 py-2 rounded-lg">
                {orderNumber}
              </p>
            </div>
          )}

          <div className="grid md:grid-cols-3 gap-6 mb-12 max-w-3xl mx-auto">
            <Card>
              <CardContent className="pt-6 text-center">
                <Package className="w-8 h-8 text-blue-600 mx-auto mb-3" />
                <h3 className="font-semibold text-gray-900 mb-2">Order Confirmed</h3>
                <p className="text-sm text-gray-600">
                  Your order has been confirmed and payment has been processed
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 text-center">
                <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-3" />
                <h3 className="font-semibold text-gray-900 mb-2">Processing</h3>
                <p className="text-sm text-gray-600">
                  We're preparing your items for shipment
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 text-center">
                <div className="w-8 h-8 border-2 border-gray-300 rounded-full mx-auto mb-3 flex items-center justify-center">
                  <div className="w-2 h-2 bg-gray-300 rounded-full"></div>
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">Shipping</h3>
                <p className="text-sm text-gray-600">
                  You'll receive tracking info once shipped
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            {orderNumber && (
              <Button 
                onClick={() => router.push(`/orders/${orderNumber}`)}
                size="lg"
                className="flex items-center gap-2"
              >
                <Package className="w-4 h-4" />
                View Order Details
              </Button>
            )}
            
            <Button 
              variant="outline" 
              onClick={() => router.push('/marketplace')}
              size="lg"
              className="flex items-center gap-2"
            >
              <ShoppingBag className="w-4 h-4" />
              Continue Shopping
            </Button>
            
            <Button 
              variant="ghost" 
              onClick={() => router.push('/')}
              size="lg"
              className="flex items-center gap-2"
            >
              <Home className="w-4 h-4" />
              Back to Home
            </Button>
          </div>

          <div className="mt-12 p-6 bg-blue-50 rounded-lg max-w-2xl mx-auto">
            <h3 className="font-semibold text-blue-900 mb-2">What happens next?</h3>
            <ul className="text-sm text-blue-800 space-y-1 text-left">
              <li>• You'll receive an order confirmation email shortly</li>
              <li>• We'll notify you when your order ships with tracking information</li>
              <li>• Expected delivery: 3-7 business days</li>
              <li>• Questions? Contact us at support@navdrishti.com</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function OrderSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center w-24 h-24 rounded-full bg-green-100 mb-8">
              <CheckCircle className="w-12 h-12 text-green-600" />
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Order Confirmed!
            </h1>
            <p className="text-gray-600 mb-8">
              Loading order details...
            </p>
          </div>
        </div>
      </div>
    }>
      <OrderSuccessContent />
    </Suspense>
  )
}