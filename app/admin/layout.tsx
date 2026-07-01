import { Metadata } from 'next';
import AdminLayoutClient from './admin-layout-client';

export const metadata: Metadata = {
  title: 'Admin',
  description: 'Administrative dashboard for managing service offers and approvals',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
