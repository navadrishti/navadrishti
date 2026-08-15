import { redirect } from 'next/navigation';

/** Announcements admin UI removed — keep route as a hard redirect. */
export default function AdminAnnouncementsPage() {
  redirect('/admin');
}
