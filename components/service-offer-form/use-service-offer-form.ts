import { useState, type ChangeEvent } from 'react'

import {
  getDefaultTransactionType,
  isTransactionAllowedForOfferType,
  OFFER_TYPE_TRANSACTION_MATRIX,
  type OfferType,
  type TransactionType,
  TRANSACTION_TYPE_OPTIONS
} from '@/lib/service-offers'

import { initialServiceOfferFormData, NUMERIC_FIELDS, requiresRentalPricing } from './helpers'
import type { ServiceOfferFormData } from './types'

export function useServiceOfferForm(token: string | null) {
  const [formData, setFormData] = useState<ServiceOfferFormData>(initialServiceOfferFormData)

  const transactionOptionsForOfferType = TRANSACTION_TYPE_OPTIONS.filter((option) =>
    OFFER_TYPE_TRANSACTION_MATRIX[formData.offer_type].includes(option.value)
  )

  const requiresPricing = requiresRentalPricing(formData)

  const setField = <K extends keyof ServiceOfferFormData>(name: K, value: ServiceOfferFormData[K]) => {
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return { urls: [] as string[], failures: [] as string[] }

    const urls: string[] = []
    const failures: string[] = []

    for (const file of Array.from(files)) {
      try {
        const uploadData = new FormData()
        uploadData.append('file', file)

        const response = await fetch('/api/upload', {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          body: uploadData
        })

        const data = await response.json()
        if (!response.ok || !data.success || !data.data?.url) {
          throw new Error(data.error || 'Failed to upload image')
        }

        urls.push(data.data.url)
      } catch {
        failures.push(file.name)
      }
    }

    return { urls, failures }
  }

  const handleTextInput = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: NUMERIC_FIELDS.has(name) ? (value === '' ? '' : Number(value)) : value
    }))
  }

  const handleOfferTypeChange = (offerType: OfferType) => {
    setFormData((prev) => {
      const transaction_type = isTransactionAllowedForOfferType(offerType, prev.transaction_type)
        ? prev.transaction_type
        : getDefaultTransactionType(offerType)
      const forcedFree = offerType === 'financial' || transaction_type === 'donate' || transaction_type === 'volunteer'

      return {
        ...prev,
        offer_type: offerType,
        transaction_type,
        price_type: forcedFree ? 'free' : prev.price_type,
        price_amount: forcedFree ? '' : prev.price_amount,
      }
    })
  }

  const handleTransactionTypeChange = (transactionType: TransactionType) => {
    if (!isTransactionAllowedForOfferType(formData.offer_type, transactionType)) return

    setFormData((prev) => ({
      ...prev,
      transaction_type: transactionType,
      price_type: transactionType === 'rent' ? 'fixed' : 'free',
      price_amount: transactionType === 'rent' ? prev.price_amount : '',
      unit_rate: transactionType === 'rent' ? prev.unit_rate : '',
    }))
  }

  return {
    formData,
    setFormData,
    setField,
    handleTextInput,
    handleUpload,
    handleOfferTypeChange,
    handleTransactionTypeChange,
    transactionOptionsForOfferType,
    requiresPricing,
  }
}

export type ServiceOfferForm = ReturnType<typeof useServiceOfferForm>
