import { z } from 'zod';
import { db } from '@/lib/db';

const nameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(100, 'Name must be less than 100 characters');

const emailSchema = z.string().trim().toLowerCase().email('Invalid email address');

type IdentityInput = { name?: unknown; email?: unknown };

type IdentityResult =
  | { ok: true; name?: string; email?: string }
  | { ok: false; status: 400 | 409; error: string };

export async function validateNameAndEmail(
  input: IdentityInput,
  userId: number,
  currentEmail: string | null | undefined
): Promise<IdentityResult> {
  let name: string | undefined;
  let email: string | undefined;

  if (input.name !== undefined) {
    const parsed = nameSchema.safeParse(input.name);
    if (!parsed.success) return { ok: false, status: 400, error: parsed.error.issues[0].message };
    name = parsed.data;
  }

  if (input.email !== undefined) {
    const parsed = emailSchema.safeParse(input.email);
    if (!parsed.success) return { ok: false, status: 400, error: parsed.error.issues[0].message };
    email = parsed.data;

    if (email !== String(currentEmail || '').trim().toLowerCase()) {
      const existing = await db.users.findByEmail(email);
      if (existing && existing.id !== userId) {
        return { ok: false, status: 409, error: 'An account with this email already exists' };
      }
    }
  }

  return { ok: true, name, email };
}
