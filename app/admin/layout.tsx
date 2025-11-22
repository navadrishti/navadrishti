import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Admin',
  description: 'Administrative dashboard for managing service offers and approvals',
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}