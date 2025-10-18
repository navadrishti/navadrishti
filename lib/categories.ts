// Centralized category definitions to ensure consistency across the application

export const SERVICE_REQUEST_CATEGORIES = [
  'Healthcare & Medical',
  'Education & Tutoring',
  'Food & Nutrition',
  'Legal & Documentation',
  'Financial Assistance',
  'Housing & Shelter',
  'Transportation',
  'Counseling & Mental Health',
  'Job Training & Employment',
  'Elderly Care',
  'Child Care',
  'Disability Support',
  'Emergency Relief',
  'Community Outreach',
  'General Support Services',
  'Translation & Language',
  'Administrative Help',
  'Other'
];

export const SERVICE_OFFER_CATEGORIES = [
  'Healthcare & Medical',
  'Education & Training',
  'Food & Nutrition',
  'Legal & Documentation',
  'Financial Services',
  'Housing & Shelter',
  'Transportation',
  'Counseling & Mental Health',
  'Job Training & Employment',
  'Elderly Care',
  'Child Welfare',
  'Disability Support',
  'Emergency Relief',
  'Community Development',
  'Women Empowerment',
  'Environmental Services',
  'General Support Services',
  'Translation & Language',
  'Administrative Services',
  'Other'
];

export const MARKETPLACE_CATEGORIES = [
  'Clothing & Textiles',
  'Food & Nutrition', 
  'Medical & Healthcare',
  'Education & Books',
  'Office & Supplies',
  'Household Items',
  'Furniture & Home',
  'Baby & Children',
  'Personal Care',
  'Transportation',
  'Emergency Supplies',
  'Tools & Equipment',
  'Other'
];

// Helper functions to get categories with "All Categories" option for filtering
export const getServiceRequestCategoriesWithAll = () => ['All Categories', ...SERVICE_REQUEST_CATEGORIES];
export const getServiceOfferCategoriesWithAll = () => ['All Categories', ...SERVICE_OFFER_CATEGORIES];
export const getMarketplaceCategoriesWithAll = () => ['All Categories', ...MARKETPLACE_CATEGORIES];