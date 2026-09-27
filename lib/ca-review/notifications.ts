import 'server-only'

import { supabase } from '@/lib/db'

export async function notifyUser(userId: number, title: string, message: string) {
  const { error } = await supabase.from('user_notifications').insert({
    user_id: userId,
    type: 'verification',
    title,
    message,
    action_url: '/verification',
  })
  if (error) {
    console.error('Failed to notify user about verification decision:', error)
  }
}
