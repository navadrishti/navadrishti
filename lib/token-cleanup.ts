// Utility to clean up expired password reset tokens
// In production, you should store tokens in a database or Redis with TTL

import { resetTokens } from '../app/api/auth/forgot-password/route';

export function cleanupExpiredTokens() {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [token, data] of resetTokens.entries()) {
    if (data.expires < now) {
      resetTokens.delete(token);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`🧹 Cleaned up ${cleanedCount} expired password reset tokens`);
  }
  
  return cleanedCount;
}

// Function to start periodic cleanup (call this when your server starts)
export function startTokenCleanup(intervalMinutes: number = 15) {
  setInterval(() => {
    cleanupExpiredTokens();
  }, intervalMinutes * 60 * 1000);
  
  console.log(`🔄 Started password reset token cleanup every ${intervalMinutes} minutes`);
}

// Get token statistics (useful for monitoring)
export function getTokenStats() {
  const now = Date.now();
  let activeCount = 0;
  let expiredCount = 0;
  
  for (const [_, data] of resetTokens.entries()) {
    if (data.expires < now) {
      expiredCount++;
    } else {
      activeCount++;
    }
  }
  
  return {
    total: resetTokens.size,
    active: activeCount,
    expired: expiredCount
  };
}