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

export const MARKETPLACE_CATEGORIES = [
  'Clothing & Apparel',
  'Books & Stationery',
  'Electronics & Devices',
  'Furniture',
  'Toys & Kids Items',
  'Medical Supplies',
  'Groceries & Essentials',
  'Home & Kitchen Items',
  'Sports Equipment',
  'Beauty & Personal Care',
  'Arts & Crafts',
  'Tools & Hardware',
  'Bicycles & Vehicles',
  'Pet Supplies',
  'Handmade NGO Products',
  'Upcycled Products',
  'Sustainable Goods',
  'Local Community Listings',
  'Free Giveaways',
  'Donation Items'
];

// Helper functions to get categories with "All Categories" option for filtering
export const getServiceRequestCategoriesWithAll = () => ['All Categories', ...SERVICE_REQUEST_CATEGORIES];
export const getServiceOfferCategoriesWithAll = () => ['All Categories', ...SERVICE_OFFER_CATEGORIES];
export const getMarketplaceCategoriesWithAll = () => ['All Categories', ...MARKETPLACE_CATEGORIES];