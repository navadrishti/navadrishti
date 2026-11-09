import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProjectCardHeader } from '@/app/ngos/dashboard/project-card-header'

describe('project card tags', () => {
  it.each([
    ['Running (scheduled dates)', 'Running', 'bg-emerald-100'],
    ['Yet to start', 'Starts soon', 'bg-sky-100'],
    ['Completed', 'Completed', 'bg-slate-200'],
    ['Cancelled', 'Cancelled', 'bg-rose-100'],
    ['Scheduled dates passed', 'Dates passed', 'bg-violet-100'],
    ['Schedule not confirmed', 'Schedule unconfirmed', 'bg-slate-100'],
  ])('shows %s with the appropriate status badge', (schedule, label, color) => {
    render(<ProjectCardHeader title="Project" status="active" role="Lead NGO" schedule={schedule} />)
    expect(screen.getAllByText(label).some((item) => item.classList.contains(color))).toBe(true)
    expect(screen.getByText('You are the lead NGO')).toBeInTheDocument()
    expect(screen.getByText('Project: Active')).toHaveClass('rounded-full', 'bg-blue-50')
  })
})
