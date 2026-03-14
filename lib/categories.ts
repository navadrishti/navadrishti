// Centralized category definitions to ensure consistency across the application

export const SERVICE_REQUEST_CATEGORIES = [
  'Education & Teaching',
  'Health & Medical Support',
  'Skill Development & Training',
  'Fundraising & Grant Support',
  'Event & Campaign Volunteers',
  'Digital & IT Support',
  'Social Media & Communications',
  'Content Creation & Documentation',
  'Design & Branding Assistance',
  'Legal & Compliance Help',
  'Administration & Data Entry',
  'Field Work & Community Outreach',
  'Environmental Activities',
  'Mental Health & Counseling',
  'Photography & Videography',
  'Research & Impact Measurement',
  'Donation Drive Support'
];

export const SERVICE_OFFER_CATEGORIES = [
  'Training & Workshops',
  'Community Outreach Programs',
  'Environmental Sustainability Services',
  'Healthcare Services & Camps',
  'Research & Survey Services',
  'Creative & Communication Services',
  'Event Management',
  'Skill Development Programs',
  'Monitoring & Evaluation',
  'Customized CSR Program Execution',
  'Women Empowerment Training',
  'Livelihood Development Programs',
  'Digital Literacy Training',
  'Awareness & Advocacy Campaigns'
];

// Helper functions to get categories with "All Categories" option for filtering
export const getServiceRequestCategoriesWithAll = () => ['All Categories', ...SERVICE_REQUEST_CATEGORIES];
export const getServiceOfferCategoriesWithAll = () => ['All Categories', ...SERVICE_OFFER_CATEGORIES];