import { describe, expect, it } from 'vitest'
import { readApiError, toUserFacingError, zodIssuesToUserMessage } from '@/lib/user-facing-error'

describe('toUserFacingError', () => {
  it('rewrites Pulse date validation into plain language', () => {
    expect(
      toUserFacingError('Validation failed', { end_date: ['start_date must be before end_date'] }),
    ).toBe('The campaign end date needs to be after the start date.')
    expect(toUserFacingError('Validation failed. end_date: start_date must be before end_date')).toBe(
      'The campaign end date needs to be after the start date.',
    )
  })

  it('rewrites budget validation into plain language', () => {
    expect(toUserFacingError('Validation failed', { budget: ['budget must be a positive number'] })).toBe(
      'Enter a budget greater than zero.',
    )
  })

  it('does not show raw field names for leftover technical details', () => {
    const message = toUserFacingError('Validation failed', { state_province: ['Required'] })
    expect(message.toLowerCase()).not.toContain('state_province')
    expect(message.toLowerCase()).not.toContain('validation failed')
  })

  it('keeps custom form messages that are already plain language', () => {
    expect(toUserFacingError('Invalid email address', { email: ['Invalid email address'] })).toBe(
      'Invalid email address',
    )
    expect(toUserFacingError('Password must be at least 8 characters')).toBe(
      'Password must be at least 8 characters',
    )
    expect(toUserFacingError('Required', { currentPassword: ['Required'] })).toBe(
      'Please fill in the current password.',
    )
  })

  it('rewrites snake_case API errors', () => {
    expect(toUserFacingError('campaign_id is required')).toBe('Please choose a campaign.')
    expect(toUserFacingError('beneficiary_count must be greater than 0')).toBe('Beneficiary count must be greater than 0.')
    expect(toUserFacingError('valid_until must be a valid date string')).toBe('Please enter a valid expiry date.')
  })

  it('rewrites database errors', () => {
    expect(toUserFacingError('duplicate key value violates unique constraint "users_email_key"')).toBe(
      'That value is already in use.',
    )
    expect(toUserFacingError('invalid input syntax for type uuid: "abc"')).toBe('This item could not be found.')
  })

  it('keeps admin auth distinct from a missing login', () => {
    expect(toUserFacingError('Admin authentication required')).toBe('You need an admin account to do that.')
    expect(toUserFacingError('Unauthorized')).toBe('Please log in to continue.')
  })

  it('rewrites offer validation into plain language', () => {
    expect(toUserFacingError('valid_until is required for all offers.')).toBe(
      'Please set an expiry date for this offer.',
    )
    expect(
      toUserFacingError('offer_type must be one of: financial, material, service, infrastructure.'),
    ).toBe('Choose financial, material, service, or infrastructure as the offer type.')
  })
})

describe('zodIssuesToUserMessage', () => {
  it('uses the first issue in plain language', () => {
    expect(
      zodIssuesToUserMessage([{ path: ['end_date'], message: 'start_date must be before end_date' }]),
    ).toBe('The campaign end date needs to be after the start date.')
  })
})

describe('readApiError', () => {
  it('reads a string error or a Zod issue array', () => {
    expect(readApiError({ error: 'campaign_id is required' })).toBe('Please choose a campaign.')
    expect(
      readApiError({
        error: [{ path: ['end_date'], message: 'start_date must be before end_date' }],
      }),
    ).toBe('The campaign end date needs to be after the start date.')
    expect(readApiError(new Error('campaign_id is required'))).toBe('Please choose a campaign.')
  })
})
