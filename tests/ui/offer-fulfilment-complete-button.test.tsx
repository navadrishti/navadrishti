import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  OFFER_FULFILMENT_COMPLETE_CONFIRM,
  OfferFulfilmentCompleteButton,
} from '@/components/offer-fulfilment-complete-button'

describe('OfferFulfilmentCompleteButton', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows Mark Fulfilment Complete for an accepted request', () => {
    render(
      <OfferFulfilmentCompleteButton requestId={9} status="accepted" onComplete={vi.fn()} />
    )
    expect(screen.getByRole('button', { name: /Mark Fulfilment Complete/i })).toBeInTheDocument()
  })

  it.each(['pending', 'rejected', 'completed', 'cancelled', 'active'] as const)(
    'hides the action for status %s',
    (status) => {
      const { container } = render(
        <OfferFulfilmentCompleteButton requestId={9} status={status} onComplete={vi.fn()} />
      )
      expect(container).toBeEmptyDOMElement()
    }
  )

  it('requires confirmation before calling onComplete', async () => {
    const onComplete = vi.fn()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(<OfferFulfilmentCompleteButton requestId={9} status="accepted" onComplete={onComplete} />)
    await userEvent.click(screen.getByRole('button', { name: /Mark Fulfilment Complete/i }))

    expect(confirm).toHaveBeenCalledWith(OFFER_FULFILMENT_COMPLETE_CONFIRM)
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('submits completion after confirmation', async () => {
    const onComplete = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<OfferFulfilmentCompleteButton requestId={9} status="accepted" onComplete={onComplete} />)
    await userEvent.click(screen.getByRole('button', { name: /Mark Fulfilment Complete/i }))

    expect(onComplete).toHaveBeenCalledWith(9)
  })

  it('disables the button while updating to prevent duplicate clicks', async () => {
    const onComplete = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(
      <OfferFulfilmentCompleteButton
        requestId={9}
        status="accepted"
        updating
        onComplete={onComplete}
      />
    )

    const button = screen.getByTestId('offer-fulfilment-complete')
    expect(button).toBeDisabled()
    await userEvent.click(button)
    expect(onComplete).not.toHaveBeenCalled()
  })
})
