import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Government Admin Panel',
  description: 'Government dashboard for manual project creation, field officer assignment, and state or district oversight',
};

export default function GovernmentAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
