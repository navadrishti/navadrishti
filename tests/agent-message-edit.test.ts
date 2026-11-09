import { describe, expect, it } from 'vitest'
import {
  applyCsrProjectAnswer,
  applyEditedCsrUserAnswer,
  CSR_MILESTONE_COUNT_PROMPT,
  firstUnfilledProjectIndex,
} from '@/app/companies/csr-agent/helpers'
import { applyEditedNgoUserAnswer } from '@/app/ngos/ai-agent/conversation'
import { projectQuestions } from '@/app/companies/csr-agent/session'

describe('applyCsrProjectAnswer', () => {
  it('skips the state question when the city maps to a state', () => {
    const result = applyCsrProjectAnswer({
      projectData: { campaignName: 'Clean Water Drive', category: 'Education' },
      questionIndex: 2,
      value: 'Mumbai',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.projectData.city).toBe('Mumbai')
    expect(result.projectData.state).toBe('Maharashtra')
    expect(result.projectStep).toBe(4)
    expect(result.assistantPrompt).toContain('Budget (INR)')
    expect(firstUnfilledProjectIndex(result.projectData)).toBe(4)
  })

  it('advances from end date to milestone count instead of asking end date again', () => {
    const result = applyCsrProjectAnswer({
      projectData: {
        campaignName: 'Clean Water Drive',
        category: 'Education',
        city: 'Mumbai',
        state: 'Maharashtra',
        budget: '150000',
        volunteerRequirement: '10 volunteers',
        startDate: '2028-12-01',
      },
      questionIndex: projectQuestions.findIndex((question) => question.key === 'endDate'),
      value: '12/12/2028',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.projectData.endDate).toBe('2028-12-12')
    expect(result.conversationStage).toBe('milestone-count')
    expect(result.assistantPrompt).toBe(CSR_MILESTONE_COUNT_PROMPT)
    expect(firstUnfilledProjectIndex(result.projectData)).toBe(projectQuestions.length)
  })
})

describe('applyEditedCsrUserAnswer', () => {
  it('keeps the edited answer, drops later messages, and re-asks the next question', () => {
    const result = applyEditedCsrUserAnswer({
      messages: [
        { role: 'assistant', content: 'Campaign name' },
        { role: 'user', content: 'Old name' },
        { role: 'assistant', content: 'Category (Schedule VII)' },
        { role: 'user', content: 'Education and Livelihood Enhancement' },
      ],
      projectData: { campaignName: 'Old name', category: 'Education and Livelihood Enhancement' },
      milestoneCount: 2,
      milestoneInputs: [{ description: 'Survey', budgetTarget: '10000' }],
      index: 1,
      text: 'Clean Water Drive',
    })

    expect(result?.messages).toEqual([
      { role: 'assistant', content: 'Campaign name' },
      { role: 'user', content: 'Clean Water Drive' },
      { role: 'assistant', content: 'Category (Schedule VII)' },
    ])
    expect(result?.projectData.campaignName).toBe('Clean Water Drive')
    expect(result?.projectData.category).toBe('')
    expect(result?.projectData.city).toBe('')
    expect(result?.milestoneCount).toBeNull()
    expect(result?.milestoneInputs).toEqual([])
    expect(result?.conversationStage).toBe('project')
    expect(result?.projectStep).toBe(1)
  })

  it('maps the last answer to end date after a city skip, then asks for milestones', () => {
    const result = applyEditedCsrUserAnswer({
      messages: [
        { role: 'assistant', content: 'Campaign name' },
        { role: 'user', content: 'Clean Water Drive' },
        { role: 'assistant', content: 'Category (Schedule VII)' },
        { role: 'user', content: 'Education' },
        { role: 'assistant', content: 'City' },
        { role: 'user', content: 'Mumbai' },
        { role: 'assistant', content: 'Got it — using Mumbai (Maharashtra). Budget (INR)' },
        { role: 'user', content: '150000' },
        { role: 'assistant', content: 'What volunteer requirement should I plan for?' },
        { role: 'user', content: '10 volunteers' },
        { role: 'assistant', content: 'Start date (DD/MM/YYYY)' },
        { role: 'user', content: '01/12/2028' },
        { role: 'assistant', content: 'End date (DD/MM/YYYY)' },
        { role: 'user', content: '12/12/2028' },
      ],
      projectData: {
        campaignName: 'Clean Water Drive',
        category: 'Education',
        city: 'Mumbai',
        state: 'Maharashtra',
        budget: '150000',
        volunteerRequirement: '10 volunteers',
        startDate: '2028-12-01',
        endDate: '',
      },
      milestoneCount: null,
      milestoneInputs: [],
      index: 13,
      text: '12/12/2028',
    })

    expect(result?.projectData.endDate).toBe('2028-12-12')
    expect(result?.projectData.startDate).toBe('2028-12-01')
    expect(result?.conversationStage).toBe('milestone-count')
    expect(result?.messages.at(-1)?.content).toBe(CSR_MILESTONE_COUNT_PROMPT)
    expect(result?.messages.filter((message) => message.content === 'End date (DD/MM/YYYY)')).toHaveLength(1)
  })
})

describe('applyEditedNgoUserAnswer', () => {
  it('keeps the edited answer, drops later messages, and re-asks the next question', () => {
    const result = applyEditedNgoUserAnswer({
      messages: [
        { role: 'assistant', content: 'Need or Project?' },
        { role: 'user', content: 'Project' },
        { role: 'assistant', content: 'What is the project title?' },
        { role: 'user', content: 'Old title' },
        { role: 'assistant', content: 'Which category?' },
        { role: 'user', content: 'Rural Development Projects' },
      ],
      projectData: { projectTitle: 'Old title', projectCategory: 'Rural Development Projects' },
      needsData: [],
      needCount: null,
      intakePath: 'project',
      index: 3,
      text: 'School toilets',
    })

    expect(result?.messages.map((message) => message.content)).toEqual([
      'Need or Project?',
      'Project',
      'What is the project title?',
      'School toilets',
      expect.stringContaining('Schedule VII'),
    ])
    expect(result?.projectData.projectTitle).toBe('School toilets')
    expect(result?.projectData.projectCategory).toBe('')
    expect(result?.conversationStage).toBe('project')
    expect(result?.generatedDraft).toBeNull()
  })
})
