import { useCallback, useSyncExternalStore } from 'react';

const ADMIN_ACTIVE_TAB_KEY = 'admin_active_tab';

const ADMIN_TAB_VALUES = new Set([
  'overview',
  'offers',
  'projects',
  'users',
  'requests',
  'campaigns',
  'support',
  'refunds',
  'ca-credentials',
]);

export const ADMIN_SIDEBAR_ITEMS = [
  { value: 'overview', label: 'Overview' },
  { value: 'offers', label: 'Offers' },
  { value: 'projects', label: 'Projects' },
  { value: 'users', label: 'People' },
  { value: 'requests', label: 'Requests' },
  { value: 'campaigns', label: 'CSR Campaigns' },
  { value: 'support', label: 'Support' },
  { value: 'refunds', label: 'Refunds' },
  { value: 'ca-credentials', label: 'CA Credentials' },
];

function readAdminActiveTab(): string {
  if (typeof window === 'undefined') return 'overview';
  try {
    const stored = sessionStorage.getItem(ADMIN_ACTIVE_TAB_KEY);
    if (stored && ADMIN_TAB_VALUES.has(stored)) return stored;
  } catch {
    // ignore sessionStorage errors
  }
  return 'overview';
}

const adminActiveTabListeners = new Set<() => void>();

function subscribeAdminActiveTab(onStoreChange: () => void) {
  adminActiveTabListeners.add(onStoreChange);
  return () => {
    adminActiveTabListeners.delete(onStoreChange);
  };
}

function persistAdminActiveTab(tab: string) {
  try {
    sessionStorage.setItem(ADMIN_ACTIVE_TAB_KEY, tab);
    adminActiveTabListeners.forEach((listener) => listener());
  } catch {
    // ignore sessionStorage errors
  }
}

export function useAdminActiveTab() {
  const activeTab = useSyncExternalStore(
    subscribeAdminActiveTab,
    readAdminActiveTab,
    () => 'overview',
  );

  const setActiveTab = useCallback((tab: string) => {
    if (!ADMIN_TAB_VALUES.has(tab)) return;
    persistAdminActiveTab(tab);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, []);

  return [activeTab, setActiveTab] as const;
}
