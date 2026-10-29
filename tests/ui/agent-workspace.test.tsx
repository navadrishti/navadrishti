import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AgentWorkspace } from '@/components/agent-workspace'

describe('AgentWorkspace', () => {
  it('keeps chat in the main column and splits history and preview into matching drawers', () => {
    render(
      <AgentWorkspace
        toolbarLabel="Invite a lead NGO"
        renderProgress={() => <p>Progress</p>}
        renderSessions={({ close }) => (
          <button type="button" onClick={close}>
            Conversations
          </button>
        )}
        renderPreview={() => <p>Preview panel</p>}
      >
        <p>Chat column</p>
      </AgentWorkspace>,
    )

    expect(screen.getByText('Chat column')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Chats' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Progress' })).toBeInTheDocument()
    expect(screen.getByText('Invite a lead NGO')).toBeInTheDocument()
    expect(screen.getAllByText('Progress').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Conversations').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Chats' }))
    expect(screen.getByRole('dialog', { name: 'Conversations' })).toBeInTheDocument()
    expect(screen.getAllByText('Conversations').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(screen.getByRole('button', { name: 'Progress' }))
    expect(screen.getByRole('dialog', { name: 'Progress' })).toBeInTheDocument()
    expect(screen.getAllByText('Preview panel').length).toBeGreaterThan(0)
  })
})
