export const AI_SUITE_NAME = 'Navadrishti AI Suite'

export const AGENT_NAMES = {
  atlas: 'Atlas',
  catalyst: 'Catalyst',
  pulse: 'Pulse',
  sentinel: 'Sentinel',
  insight: 'Insight',
} as const

export const AGENT_ROUTES = {
  atlas: '/ngos/ai-agent',
  catalyst: '/companies/csr-agent',
} as const

export const AGENT_CTA = {
  company: {
    href: AGENT_ROUTES.catalyst,
    title: AGENT_NAMES.catalyst,
    description: 'Build CSR campaigns with AI',
    openLabel: 'Open Catalyst',
    closeLabel: 'Close Catalyst',
  },
  ngo: {
    href: AGENT_ROUTES.atlas,
    title: AGENT_NAMES.atlas,
    description: 'Draft service requests with AI',
    openLabel: 'Open Atlas',
    closeLabel: 'Close Atlas',
  },
} as const

export function agentLoadingLabel(name: string) {
  return `Loading ${name}...`
}

export const AGENT_GREETINGS = {
  atlas:
    "Hello! I'm Atlas. We'll do this step-by-step: project details first, then number of needs, then each need's details. Let's start with the project title.",
  catalyst:
    "Hello! I'm Catalyst. We'll capture the campaign details step by step, then I'll generate campaign drafts. Let's start with the campaign name.",
} as const
