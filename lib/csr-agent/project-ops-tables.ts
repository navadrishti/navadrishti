import { supabase } from '@/lib/db'

/** Untyped access for csr_project_expenses / csr_project_materials (not yet in generated Database types). */
export function opsTable(table: 'csr_project_expenses' | 'csr_project_materials') {
  return (supabase as unknown as { from: (name: string) => ReturnType<typeof supabase.from> }).from(table)
}
