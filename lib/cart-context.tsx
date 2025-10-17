'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'

interface CartItem {
  id: number
  marketplace_item_id: number
  title: string
  price: number
  quantity: number
  images: string[]
  category: string
  brand?: string
  seller_name: string
  seller_id: number | null
  item_total: number
  variant_selection?: Record<string, any>
  max_quantity: number
}

interface CartSummary {
  item_count: number
  total_quantity: number
  subtotal: number
  shipping: number
  tax: number
  total: number
}

interface CartContextType {
  cart: CartItem[]
  summary: CartSummary | null
  loading: boolean
  refreshCart: () => Promise<void>
  addToCart: (itemId: number, quantity?: number, variants?: Record<string, any>) => Promise<boolean>
  updateQuantity: (cartId: number, quantity: number) => Promise<boolean>
  removeFromCart: (cartId: number) => Promise<boolean>
  clearCart: () => void
  getCartItemCount: () => number
}

const CartContext = createContext<CartContextType | undefined>(undefined)

export const useCart = () => {
  const context = useContext(CartContext)
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider')
  }
  return context
}

interface CartProviderProps {
  children: ReactNode
}

export function CartProvider({ children }: CartProviderProps) {
  const [cart, setCart] = useState<CartItem[]>([])
  const [summary, setSummary] = useState<CartSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const { user } = useAuth()

  // Get auth token for API calls
  const getAuthToken = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('token')
    }
    return null
  }

  // Fetch cart from API
  const refreshCart = async () => {
    try {
      setLoading(true)
      const token = getAuthToken()
      
      if (!token) {
        setCart([])
        setSummary(null)
        return
      }

      const response = await fetch('/api/cart', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setCart(data.cart || [])
          setSummary(data.summary || null)
        } else {
          console.error('Cart API error:', data.error)
          setCart([])
          setSummary(null)
        }
      } else {
        console.error('Failed to fetch cart:', response.status)
        setCart([])
        setSummary(null)
      }
    } catch (error) {
      console.error('Cart fetch error:', error)
      setCart([])
      setSummary(null)
    } finally {
      setLoading(false)
    }
  }

  // Add item to cart
  const addToCart = async (itemId: number, quantity = 1, variants?: Record<string, any>): Promise<boolean> => {
    try {
      setLoading(true)
      const token = getAuthToken()
      if (!token) {
        toast.error('Please login to add items to cart')
        return false
      }

      const response = await fetch('/api/cart', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          marketplace_item_id: itemId,
          quantity,
          variant_selection: variants
        }),
      })

      const data = await response.json()
      
      if (response.ok && data.success) {
        toast.success('Item added to cart!')
        // Refresh cart immediately to ensure real-time updates
        await refreshCart()
        return true
      } else {
        toast.error(data.error || 'Failed to add item to cart')
        return false
      }
    } catch (error) {
      console.error('Add to cart error:', error)
      toast.error('Failed to add item to cart')
      return false
    } finally {
      setLoading(false)
    }
  }

  // Update item quantity in cart
  const updateQuantity = async (cartId: number, quantity: number): Promise<boolean> => {
    try {
      setLoading(true)
      const token = getAuthToken()
      if (!token) {
        toast.error('Please login to update cart')
        return false
      }

      const response = await fetch('/api/cart', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cart_id: cartId,
          quantity
        }),
      })

      const data = await response.json()
      
      if (response.ok && data.success) {
        // Show appropriate message
        if (quantity === 0) {
          toast.success('Item removed from cart')
        } else {
          toast.success('Quantity updated')
        }
        await refreshCart()
        return true
      } else {
        toast.error(data.error || 'Failed to update quantity')
        return false
      }
    } catch (error) {
      console.error('Update quantity error:', error)
      toast.error('Failed to update quantity')
      return false
    } finally {
      setLoading(false)
    }
  }

  // Remove item from cart
  const removeFromCart = async (cartId: number): Promise<boolean> => {
    try {
      setLoading(true)
      const token = getAuthToken()
      if (!token) {
        toast.error('Please login to remove items')
        return false
      }

      const response = await fetch(`/api/cart?cart_id=${cartId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json()
      
      if (response.ok && data.success) {
        toast.success('Item removed from cart')
        await refreshCart()
        return true
      } else {
        toast.error(data.error || 'Failed to remove item')
        return false
      }
    } catch (error) {
      console.error('Remove from cart error:', error)
      toast.error('Failed to remove item')
      return false
    } finally {
      setLoading(false)
    }
  }

  // Clear entire cart (local state only)
  const clearCart = () => {
    setCart([])
    setSummary(null)
  }

  // Get total item count for badge
  const getCartItemCount = (): number => {
    return cart.reduce((total, item) => total + item.quantity, 0)
  }

  // Load cart on mount and when auth changes
  useEffect(() => {
    refreshCart()
  }, [])

  // Clear cart immediately when user logs out
  useEffect(() => {
    if (!user) {
      setCart([])
      setSummary(null)
    }
  }, [user])

  const value: CartContextType = {
    cart,
    summary,
    loading,
    refreshCart,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
    getCartItemCount,
  }

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  )
}