export const COMPANY_DASHBOARD_SIDEBAR_ITEMS = [
  { value: 'profile', label: 'Profile' },
  { value: 'capability-offers', label: 'Capability Offers' },
  { value: 'csr-projects', label: 'CSR Projects' },
  { value: 'company-ca', label: 'CA' },
  { value: 'impact-reports', label: 'Impact Reports' },
  { value: 'payments', label: 'Payments' },
];

export function resolveCompanyDashboardTab(requestedTab: string) {
  if (requestedTab === 'service-requests') return 'csr-projects';
  if (requestedTab === 'services-hired') return 'capability-offers';
  if (requestedTab === 'csr-budget' || requestedTab === 'csr-health') return 'impact-reports';
  return requestedTab;
}

export const companyDashboardTabHref = (tab: string) => `/companies/dashboard?tab=${tab}`;
