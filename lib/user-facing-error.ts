const FIELD_LABELS: Record<string, string> = {
  end_date: 'end date',
  start_date: 'start date',
  state_province: 'state',
  campaign_name: 'campaign name',
  campaign_id: 'campaign',
  offer_id: 'offer',
  ngo_user_id: 'NGO',
  user_id: 'user',
  company_id: 'company',
  session_id: 'conversation',
  sessionId: 'conversation',
  draftCampaignId: 'draft campaign',
  requirementDetails: 'requirement details',
  milestone_info: 'milestones',
  budget_allocated: 'budget',
  budget_inr: 'budget',
  price_amount: 'price',
  beneficiary_count: 'beneficiary count',
  expected_beneficiaries: 'expected beneficiaries',
  volunteers_needed: 'volunteers needed',
  valid_until: 'expiry date',
  device_id: 'device',
  captured_at: 'capture time',
  payment_id: 'payment',
  order_id: 'order',
  request_id: 'request',
  project_id: 'project',
  service_offer_id: 'service offer',
  user_type: 'account type',
  profile_data: 'profile details',
  ngo_volunteer_capacity: 'volunteer capacity',
  schedule_vii: 'category',
  impact_metrics: 'impact details',
  account_holder_name: 'account holder name',
  account_number: 'account number',
}

const KNOWN_MESSAGES: Array<[RegExp, string]> = [
  [/start_date must be before end_date/i, 'The campaign end date needs to be after the start date.'],
  [/end_date: start_date must be before end_date/i, 'The campaign end date needs to be after the start date.'],
  [/budget must be a positive number/i, 'Enter a budget greater than zero.'],
  [/expected number, received nan/i, 'Enter a valid number.'],
  [/string must contain at least (\d+) character/i, 'This needs to be at least $1 characters.'],
  [/too small: expected string to have >=(\d+) characters/i, 'This needs to be at least $1 characters.'],
  [/expected number, received .+/i, 'Enter a valid number.'],
  [/expected string, received .+/i, 'Please check this field and try again.'],
  [/invalid (uuid|uuidv4)/i, 'This item could not be found.'],
  [/invalid date/i, 'Please enter a valid date.'],
  [/invalid_type|too_small|too_big|invalid_string|invalid_enum_value/i, 'Please check your details and try again.'],
  [/invalid input syntax for type uuid/i, 'This item could not be found.'],
  [/duplicate key value violates unique constraint/i, 'That value is already in use.'],
  [/violates row-level security policy/i, 'You do not have permission to do that.'],
  [/violates (not-null|check|foreign key) constraint/i, 'Please check your details and try again.'],
  [/admin authentication required/i, 'You need an admin account to do that.'],
  [/^(login required|authentication required|unauthorized)$/i, 'Please log in to continue.'],
  [/missing required fields: title, description, offer_type, transaction_type/i, 'Please fill in the title, description, offer type, and transaction type.'],
  [/offer_type must be one of/i, 'Choose financial, material, service, or infrastructure as the offer type.'],
  [/transaction_type must be one of/i, 'Choose volunteer, donate, or rent as the transaction type.'],
  [/transaction_type .+ is not allowed for offer_type/i, 'That transaction type is not allowed for this offer type.'],
  [/valid_until is required/i, 'Please set an expiry date for this offer.'],
  [/valid_until must be a valid date/i, 'Please enter a valid expiry date.'],
  [/valid_until must be in the future/i, 'The expiry date needs to be in the future.'],
  [/price_type must be fixed or negotiable/i, 'Choose a fixed or negotiable price.'],
  [/campaign_id and offer_id are required/i, 'Please choose a campaign and an offer.'],
  [/campaign_id is required|campaign_id required/i, 'Please choose a campaign.'],
  [/offer_id is required/i, 'Please choose an offer.'],
  [/ngo_user_id is required/i, 'Please choose an NGO.'],
  [/sessionid or draftcampaignid is required/i, 'Please save this conversation first.'],
  [/valid_until must be a valid date string/i, 'Please enter a valid expiry date.'],
  [/expected_beneficiaries must be provided and greater than 0/i, 'Please enter how many people this will help.'],
  [/beneficiary_count must be greater than 0/i, 'Beneficiary count must be greater than 0.'],
  [/volunteers_needed must be provided and greater than 0/i, 'Please enter how many volunteers are needed.'],
  [/device_id and captured_at are required/i, 'Device and capture time are required.'],
  [/attendanceentryid\(s\) or contributionid\(s\) required/i, 'Please choose the items to pay for.'],
  [/razorpay is not configured/i, 'Payments are not available right now. Please try again later.'],
  [/internal server error/i, 'Something went wrong. Please try again.'],
]

function humanizeFieldName(field: string) {
  const key = field.trim()
  if (FIELD_LABELS[key]) return FIELD_LABELS[key]
  const lower = key.toLowerCase()
  if (FIELD_LABELS[lower]) return FIELD_LABELS[lower]
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function capitalize(text: string) {
  if (!text) return text
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function mapKnownMessage(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return ''
  for (const [pattern, message] of KNOWN_MESSAGES) {
    const match = trimmed.match(pattern)
    if (match) return message.replace(/\$(\d+)/g, (_unused, index: string) => match[Number(index)] || '')
  }
  return ''
}

function flattenDetails(details: unknown): string[] {
  if (!details) return []
  if (typeof details === 'string') return [details]
  if (Array.isArray(details)) {
    return details.flatMap((entry) => {
      if (entry && typeof entry === 'object' && 'message' in entry) {
        const issue = entry as { path?: PropertyKey[]; message?: string }
        return [zodIssuesToUserMessage([issue])]
      }
      return flattenDetails(entry)
    })
  }
  if (typeof details === 'object') {
    return Object.entries(details as Record<string, unknown>).flatMap(([key, value]) => {
      const values = Array.isArray(value) ? value : [value]
      return values.flatMap((entry) => {
        const text = String(entry || '').trim()
        if (!text) return []
        const mapped = mapKnownMessage(text) || mapKnownMessage(`${key}: ${text}`)
        if (mapped) return [mapped]
        if (/^(required|invalid)$/i.test(text)) return [`Please fill in the ${humanizeFieldName(key)}.`]
        const cleaned = stripTechnicalNoise(text)
        if (cleaned && !looksTechnicalError(cleaned) && !/^[a-z0-9_]+$/i.test(cleaned)) return [cleaned]
        if (/^[a-z0-9_]+$/i.test(text)) return [`Please check the ${humanizeFieldName(text)}.`]
        return [`Please check the ${humanizeFieldName(key)}.`]
      })
    })
  }
  return []
}

function rewriteSnakeCasePhrases(text: string) {
  return text
    .replace(
      /\b([A-Za-z]+(?:_[A-Za-z0-9]+)+) and ([A-Za-z]+(?:_[A-Za-z0-9]+)+) are required\b/gi,
      (_match, first: string, second: string) =>
        `Please fill in the ${humanizeFieldName(first)} and ${humanizeFieldName(second)}.`,
    )
    .replace(
      /\b([A-Za-z]+(?:_[A-Za-z0-9]+)+) is required\b/gi,
      (_match, field: string) => `Please fill in the ${humanizeFieldName(field)}.`,
    )
    .replace(
      /\b([A-Za-z]+(?:_[A-Za-z0-9]+)+) required\b/gi,
      (_match, field: string) => `Please fill in the ${humanizeFieldName(field)}.`,
    )
    .replace(
      /\b([A-Za-z]+(?:_[A-Za-z0-9]+)+) must be a valid date string\b/gi,
      (_match, field: string) => `Please enter a valid ${humanizeFieldName(field)}.`,
    )
    .replace(
      /\b([A-Za-z]+(?:_[A-Za-z0-9]+)+) must be (.+?)\.?$/gi,
      (_match, field: string, rest: string) =>
        `${capitalize(humanizeFieldName(field))} must be ${rest.replace(/\bstring\b/gi, '').replace(/\s+/g, ' ').trim()}.`,
    )
    .replace(/\b([a-z]+(?:_[a-z0-9]+)+)\b/gi, (token) => humanizeFieldName(token))
}

function stripTechnicalNoise(text: string) {
  const rewritten = rewriteSnakeCasePhrases(
    text
      .replace(/\bValidation failed\.?\s*/gi, '')
      .replace(/\bnull value in column "([^"]+)"[^.]*\.?/gi, (_match, column: string) => {
        return `Please fill in the ${humanizeFieldName(column)}.`
      })
      .replace(/\bcolumn "([^"]+)"[^.]*\.?/gi, (_match, column: string) => {
        return `Please check the ${humanizeFieldName(column)}.`
      }),
  )
  return rewritten.replace(/\s+/g, ' ').replace(/\s+\./g, '.').trim()
}

export function looksTechnicalError(text: string) {
  const value = String(text || '')
  return (
    /validation failed/i.test(value) ||
    /\b[a-z]+_[a-z0-9]+\b/i.test(value) ||
    /expected .+, received/i.test(value) ||
    /invalid input syntax/i.test(value) ||
    /violates (unique|row-level|not-null|check|foreign key)/i.test(value) ||
    /column "[^"]+"/i.test(value) ||
    /\[object Object\]/i.test(value) ||
    /too_small|invalid_type|invalid_string|invalid_enum_value/i.test(value)
  )
}

export function toUserFacingError(error?: string | null, details?: unknown): string {
  const raw = String(error || '').trim()
  const mappedRaw = mapKnownMessage(raw)
  if (mappedRaw) return mappedRaw

  const fromDetails = flattenDetails(details).filter(Boolean)
  if (/^(required|invalid)$/i.test(raw) && fromDetails[0]) return fromDetails[0]

  if (raw && !looksTechnicalError(raw) && !/^(required|invalid|validation failed)$/i.test(raw)) {
    return raw
  }

  if (fromDetails[0] && fromDetails[0] !== 'Something went wrong. Please try again.') return fromDetails[0]

  const combinedMapped = mapKnownMessage(`${raw} ${fromDetails.join(' ')}`)
  if (combinedMapped) return combinedMapped

  const cleaned = stripTechnicalNoise(raw)
  if (cleaned && !/^validation failed$/i.test(cleaned)) return cleaned
  if (fromDetails[0]) return fromDetails[0]
  return 'Something went wrong. Please try again.'
}

export function zodIssuesToUserMessage(
  issues: Array<{ path?: PropertyKey[]; message?: string }> | undefined,
): string {
  const first = issues?.[0]
  const path = Array.isArray(first?.path) ? first.path.map(String).filter(Boolean).join('.') : ''
  const message = String(first?.message || '').trim()
  return toUserFacingError(message || 'Validation failed', path ? { [path]: [message] } : undefined)
}

export function readApiError(data: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (data == null || data === '') return toUserFacingError(fallback)
  if (typeof data === 'string') return toUserFacingError(data) || fallback
  if (Array.isArray(data)) return zodIssuesToUserMessage(data) || fallback
  if (typeof data !== 'object') return toUserFacingError(fallback)

  const rec = data as Record<string, unknown>
  if (Array.isArray(rec.error)) return zodIssuesToUserMessage(rec.error as Array<{ path?: PropertyKey[]; message?: string }>) || fallback
  if (rec.error && typeof rec.error === 'object' && 'message' in rec.error) {
    return toUserFacingError(String((rec.error as { message?: string }).message || fallback), rec.details)
  }
  const raw =
    typeof rec.error === 'string'
      ? rec.error
      : typeof rec.message === 'string'
        ? rec.message
        : fallback
  return toUserFacingError(raw, rec.details) || fallback
}
