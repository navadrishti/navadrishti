// This demo page has been removed for production.
// Redirect users to the main application.

import { redirect } from 'next/navigation'

export default function SimplePage() {
  redirect('/')
}