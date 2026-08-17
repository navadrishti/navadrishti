import crypto from 'crypto';

export const PASSWORD_RESET_TOKEN_TTL_MS = 15 * 60 * 1000;

type PasswordResetTokenRecord = {
  email: string;
  userId: number;
  expires: number;
};

const passwordResetTokens = new Map<string, PasswordResetTokenRecord>();

export const normalizeResetEmail = (value: string) => value.trim().toLowerCase();

export const cleanupPasswordResetStores = () => {
  const now = Date.now();

  for (const [token, record] of passwordResetTokens.entries()) {
    if (record.expires <= now) {
      passwordResetTokens.delete(token);
    }
  }
};

export const createPasswordResetToken = (email: string, userId: number) => {
  const resetToken = crypto.randomBytes(32).toString('hex');
  passwordResetTokens.set(resetToken, {
    email: normalizeResetEmail(email),
    userId,
    expires: Date.now() + PASSWORD_RESET_TOKEN_TTL_MS,
  });
  return resetToken;
};

export const getPasswordResetToken = (token: string) => passwordResetTokens.get(token);

export const deletePasswordResetToken = (token: string) => {
  passwordResetTokens.delete(token);
};
