// Centralized category definitions to ensure consistency across the application

export const SERVICE_REQUEST_CATEGORIES = [
  'Financial Need',
  'Material Need',
  'Skill / Service Need',
  'Infrastructure Project'
];

export const SERVICE_OFFER_CATEGORIES = [
  'Funding Capacity',
  'Material Supply',
  'Skill / Expertise',
  'Execution Capability'
];

// Helper functions to get categories with "All Categories" option for filtering
export const getServiceRequestCategoriesWithAll = () => ['All Categories', ...SERVICE_REQUEST_CATEGORIES];
export const getServiceOfferCategoriesWithAll = () => ['All Categories', ...SERVICE_OFFER_CATEGORIES];