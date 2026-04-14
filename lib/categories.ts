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