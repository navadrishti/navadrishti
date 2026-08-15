import { Metadata } from 'next';
import AdminLayoutClient from './admin-layout-client';
import { getSiteDocumentTitle } from '@/lib/access-control';

const siteTitle = getSiteDocumentTitle();

export const metadata: Metadata = {
  title: {
    absolute: siteTitle,
    default: siteTitle,
  },
  description: 'Administrative dashboard for managing service offers and approvals',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
