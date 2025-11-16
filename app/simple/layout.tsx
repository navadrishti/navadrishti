import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Navadrishti',
  description: 'Social impact platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  )
}