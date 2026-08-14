// Centralized taxonomy definitions to keep project categories and need / capability types distinct.

export const CSR_SCHEDULE_VII_CATEGORIES = [
  'Eradicating Hunger, Poverty and Malnutrition',
  'Promoting Healthcare and Sanitation',
  'Education and Livelihood Enhancement',
  'Gender Equality and Women Empowerment',
  'Environmental Sustainability',
  'Protection of Heritage, Art and Culture',
  'Support for Armed Forces Veterans',
  'Rural Development Projects',
  'Slum Area Development',
  'Sports Promotion',
  'Disaster Management and Relief'
] as string[];

export const SERVICE_REQUEST_TYPES = [
  'Financial Need',
  'Material Need',
  'Skill / Service Need',
  'Infrastructure Project'
] as string[];

export const SERVICE_OFFER_TYPES = [
  'Funding Capacity',
  'Material Supply',
  'Skill / Expertise',
  'Execution Capability'
] as string[];

// Backward-compatible aliases used by existing code paths.
export const SERVICE_REQUEST_CATEGORIES = SERVICE_REQUEST_TYPES;
export const SERVICE_OFFER_CATEGORIES = SERVICE_OFFER_TYPES;

// Helper functions to get values with "All Categories" option for filtering.
export const getServiceRequestCategoriesWithAll = () => ['All Categories', ...CSR_SCHEDULE_VII_CATEGORIES];
export const getServiceOfferCategoriesWithAll = () => ['All Categories', ...SERVICE_OFFER_TYPES];

export const getScheduleVIICategoriesWithAll = () => ['All Categories', ...CSR_SCHEDULE_VII_CATEGORIES];
export const getServiceRequestTypesWithAll = () => ['All Categories', ...SERVICE_REQUEST_TYPES];
export const getServiceOfferTypesWithAll = () => ['All Categories', ...SERVICE_OFFER_TYPES];

export const COMPANY_CSR_IMPLEMENTATION_MODELS = [
  { value: 'direct', label: 'Direct implementation by company' },
  { value: 'partner_led', label: 'Partner-led (NGO / implementing agency)' },
  { value: 'hybrid', label: 'Hybrid (direct + NGO partners)' },
  { value: 'grant_making', label: 'Grant-making / funding only' },
] as const;

export const COMPANY_CSR_GOVERNANCE_MECHANISMS = [
  { value: 'csr_committee_board', label: 'CSR Committee with Board approval' },
  { value: 'management_csr_cell', label: 'Management-led CSR cell' },
  { value: 'third_party_monitoring', label: 'Third-party impact monitoring' },
  { value: 'hybrid_governance', label: 'Hybrid (committee + external review)' },
] as const;

export type CompanyCsrImplementationModel = (typeof COMPANY_CSR_IMPLEMENTATION_MODELS)[number]['value'];
export type CompanyCsrGovernanceMechanism = (typeof COMPANY_CSR_GOVERNANCE_MECHANISMS)[number]['value'];

export function isValidCompanyCsrImplementationModel(value: string): value is CompanyCsrImplementationModel {
  return COMPANY_CSR_IMPLEMENTATION_MODELS.some((entry) => entry.value === value);
}

export function isValidCompanyCsrGovernanceMechanism(value: string): value is CompanyCsrGovernanceMechanism {
  return COMPANY_CSR_GOVERNANCE_MECHANISMS.some((entry) => entry.value === value);
}

export function getCompanyCsrImplementationModelLabel(value: string): string {
  return COMPANY_CSR_IMPLEMENTATION_MODELS.find((entry) => entry.value === value)?.label || value;
}

export function getCompanyCsrGovernanceMechanismLabel(value: string): string {
  return COMPANY_CSR_GOVERNANCE_MECHANISMS.find((entry) => entry.value === value)?.label || value;
}

export function normalizeCompanyFocusAreasScheduleVii(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is string =>
        typeof item === 'string' && CSR_SCHEDULE_VII_CATEGORIES.includes(item)
    );
  }

  if (typeof value === 'string' && value.trim()) {
    const lower = value.toLowerCase();
    return CSR_SCHEDULE_VII_CATEGORIES.filter((category) => lower.includes(category.toLowerCase()));
  }

  return [];
}

export function normalizeCompanyImplementationModel(value: unknown): CompanyCsrImplementationModel | '' {
  const text = String(value || '').trim();
  if (isValidCompanyCsrImplementationModel(text)) {
    return text;
  }

  const lower = text.toLowerCase();
  if (lower.includes('hybrid')) return 'hybrid';
  if (lower.includes('partner') || lower.includes('ngo')) return 'partner_led';
  if (lower.includes('grant') || lower.includes('fund')) return 'grant_making';
  if (lower.includes('direct')) return 'direct';
  return '';
}

export function normalizeCompanyGovernanceMechanism(value: unknown): CompanyCsrGovernanceMechanism | '' {
  const text = String(value || '').trim();
  if (isValidCompanyCsrGovernanceMechanism(text)) {
    return text;
  }

  const lower = text.toLowerCase();
  if (lower.includes('hybrid')) return 'hybrid_governance';
  if (lower.includes('third') || lower.includes('external') || lower.includes('audit')) {
    return 'third_party_monitoring';
  }
  if (lower.includes('management') || lower.includes('csr cell')) return 'management_csr_cell';
  if (lower.includes('committee') || lower.includes('board')) return 'csr_committee_board';
  return '';
}