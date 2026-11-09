import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CsrProjectCard } from '@/app/ngos/dashboard/csr-project-card'
import type { NgoCsrProject } from '@/app/ngos/dashboard/types'

describe('NGO assigned project card', () => {
  it('shows only the restricted summary and does not request the financial evidence timeline', () => {
    const onViewEvidence = vi.fn()
    const project: NgoCsrProject = {
      id: 'project-1',
      title: 'Assigned project',
      region: 'Region',
      project_status: 'active',
      financial_access: false,
    }

    render(
      <CsrProjectCard
        project={project}
        variant="ongoing"
        evidence={undefined}
        loadingEvidence={false}
        onViewEvidence={onViewEvidence}
      />
    )

    expect(screen.getByText('Assigned project')).toBeInTheDocument()
    expect(screen.getByText(/financial and expense details are not available/i)).toBeInTheDocument()
    expect(screen.queryByText('Financial overview')).not.toBeInTheDocument()
    expect(screen.queryByText('Project expenses & materials')).not.toBeInTheDocument()
    expect(screen.queryByText('Evidence timeline')).not.toBeInTheDocument()
    expect(onViewEvidence).not.toHaveBeenCalled()
  })

  it('retains finance and expense controls for an authorized lead', () => {
    const project: NgoCsrProject = {
      id: 'project-2',
      title: 'Lead project',
      region: 'Region',
      project_status: 'active',
      financial_access: true,
    }

    render(
      <CsrProjectCard
        project={project}
        variant="ongoing"
        evidence={undefined}
        loadingEvidence={false}
        onViewEvidence={vi.fn()}
      />
    )
    expect(screen.getByText('Financial overview')).toBeInTheDocument()
    expect(screen.getByText('You are the lead NGO')).toBeInTheDocument()
    expect(screen.getAllByText('Schedule unconfirmed')).toHaveLength(2)
    expect(screen.getByText('Project: Active')).toHaveClass('bg-blue-50')
    expect(screen.getByText('Project expenses & materials')).toBeInTheDocument()
  })

  it('fails closed when the financial authorization flag is missing', () => {
    const onViewEvidence = vi.fn()
    const project: NgoCsrProject = {
      id: 'project-3', title: 'Unconfirmed project', region: 'Region', project_status: 'active',
    }
    render(<CsrProjectCard project={project} variant="ongoing" evidence={undefined}
      loadingEvidence={false} onViewEvidence={onViewEvidence} />)
    expect(screen.queryByText('Financial overview')).not.toBeInTheDocument()
    expect(screen.queryByText('Project expenses & materials')).not.toBeInTheDocument()
    expect(screen.getByText('NGO role not confirmed')).toBeInTheDocument()
    expect(onViewEvidence).not.toHaveBeenCalled()
  })
})
