import type { JsonRecord } from '@/lib/utils'
import { getServiceRequestTarget } from './capacity'
import type { NgoNeedFulfillmentMode, ServiceRequestInput, ServiceRequestLike } from './types'

export function normalizeServiceRequestRecord(request: unknown) {
  if (!request) return null
  if (Array.isArray(request)) return request[0] || null
  if (typeof request === 'object') return request as JsonRecord
  return null
}

function firstServiceRequest(request: ServiceRequestInput): ServiceRequestLike | null {
  if (!request) return null
  if (Array.isArray(request)) return request[0] || null
  return typeof request === 'object' ? request : null
}

export function getNgoNeedFulfillmentMode(request: ServiceRequestInput): NgoNeedFulfillmentMode {
  const normalized = firstServiceRequest(request)
  const type = String(
    normalized?.request_type || normalized?.category || getServiceRequestTarget(normalized).type || ''
  ).toLowerCase()

  if (type.includes('financial')) return 'financial'
  if (type.includes('material') || type.includes('deliver')) return 'material'
  if (type.includes('infrastructure') || type.includes('infra')) return 'infrastructure'
  if (type.includes('skill') || type.includes('service')) return 'skill_service'
  return 'skill_service'
}

export function shouldUseDelhiveryForNeed(request: ServiceRequestInput) {
  return getNgoNeedFulfillmentMode(request) === 'material'
}

export function shouldUseRazorpayForNeed(request: ServiceRequestInput) {
  return getNgoNeedFulfillmentMode(request) === 'financial'
}

export function shouldUseNgoMarkedDailyAttendance(request: ServiceRequestInput) {
  return getNgoNeedFulfillmentMode(request) === 'skill_service'
}

export function isInfrastructureNeed(request: ServiceRequestInput) {
  return getNgoNeedFulfillmentMode(request) === 'infrastructure'
}

export function shouldCreateSkillServiceAssignment(request: ServiceRequestInput) {
  const mode = getNgoNeedFulfillmentMode(request)
  return mode === 'skill_service' || mode === 'infrastructure'
}
