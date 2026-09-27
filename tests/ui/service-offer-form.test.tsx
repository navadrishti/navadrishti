import { useEffect, useState, type FormEvent } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { buildServiceOfferPayload, validateServiceOfferForm } from '@/components/service-offer-form/helpers'
import { offerToFormData, type ServiceOfferResponse } from '@/components/service-offer-form/offer-to-form-data'
import { ServiceOfferFormFields } from '@/components/service-offer-form/service-offer-form-fields'
import { useServiceOfferForm } from '@/components/service-offer-form/use-service-offer-form'

const user = userEvent.setup({ delay: null })

function OfferFormHarness({ initialOffer }: { initialOffer?: ServiceOfferResponse }) {
  const form = useServiceOfferForm('tok')
  const [message, setMessage] = useState('')
  const { setFormData } = form

  useEffect(() => {
    if (initialOffer) setFormData(offerToFormData(initialOffer))
  }, [initialOffer, setFormData])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const error = validateServiceOfferForm(form.formData)
    setMessage(error ?? `payload:${JSON.stringify(buildServiceOfferPayload(form.formData))}`)
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <ServiceOfferFormFields form={form} />
      <button type="submit">Save</button>
      <output>{message}</output>
    </form>
  )
}

function combobox(value: string) {
  const match = screen.getAllByRole('combobox').find((element) => element.textContent === value)
  if (!match) throw new Error(`no combobox showing "${value}"`)
  return match
}

async function chooseOption(current: string, next: string) {
  await user.click(combobox(current))
  await user.click(await screen.findByRole('button', { name: next }))
}

async function transactionOptions(current: string) {
  await user.click(combobox(current))
  const options = ['Volunteer', 'Donate', 'Rent'].filter((label) => screen.queryByRole('button', { name: label }))
  await user.keyboard('{Escape}')
  return options
}

describe('ServiceOfferFormFields', () => {
  it('offers only Donate for financial offers', async () => {
    render(<OfferFormHarness />)

    expect(combobox('Financial')).toBeInTheDocument()
    expect(await transactionOptions('Donate')).toEqual(['Donate'])
    expect(screen.getByLabelText(/Daily Rate \(synced\)/)).toBeDisabled()
  })

  it('switches infrastructure offers to Rent only', async () => {
    render(<OfferFormHarness />)

    await chooseOption('Financial', 'Infrastructure')

    expect(combobox('Rent')).toBeInTheDocument()
    expect(await transactionOptions('Rent')).toEqual(['Rent'])
    expect(screen.getByLabelText('Capacity')).toBeInTheDocument()
    expect(screen.getByLabelText(/Daily Rate \(synced\)/)).toBeEnabled()
  })

  it('offers Volunteer and Rent for service offers', async () => {
    render(<OfferFormHarness />)

    await chooseOption('Financial', 'Service / Skill')

    expect(combobox('Volunteer')).toBeInTheDocument()
    expect(await transactionOptions('Volunteer')).toEqual(['Volunteer', 'Rent'])
    expect(screen.getByLabelText('Skills Required (comma separated)')).toBeInTheDocument()
  })

  it('keeps Donate when switching to material', async () => {
    render(<OfferFormHarness />)

    await chooseOption('Financial', 'Material')

    expect(await transactionOptions('Donate')).toEqual(['Donate', 'Rent'])
    expect(screen.getByLabelText('Quantity')).toBeInTheDocument()
  })

  it('normalizes a disallowed transaction type when editing', async () => {
    render(<OfferFormHarness initialOffer={{ title: 'Hall', description: 'Community hall', offer_type: 'infrastructure', transaction_type: 'donate' }} />)

    expect(combobox('Infrastructure')).toBeInTheDocument()
    expect(combobox('Rent')).toBeInTheDocument()
    expect(screen.getByLabelText('Offer Title *')).toHaveValue('Hall')
  })

  it('requires title and description', async () => {
    render(<OfferFormHarness />)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('status')).toHaveTextContent('Please complete all required capability details.')
  })

  it('requires an impact area', async () => {
    render(<OfferFormHarness />)
    await user.type(screen.getByLabelText('Offer Title *'), 'Grant')
    await user.type(screen.getByLabelText('Description *'), 'Education grant')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('status')).toHaveTextContent('Please select at least one impact area.')
  })

  it('requires a daily rate for rentals', async () => {
    render(
      <OfferFormHarness
        initialOffer={{
          title: 'Tractor',
          description: 'Farm tractor',
          offer_type: 'infrastructure',
          transaction_type: 'rent',
          impact_area: ['rural_development'],
          valid_until: '2099-01-01',
          price_type: 'fixed',
        }}
      />,
    )
    expect(combobox('Infrastructure')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByRole('status')).toHaveTextContent('Please enter a valid daily rental rate.')
  })
})
