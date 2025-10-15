import { NextRequest } from 'next/server';
import { executeQuery } from './db';
import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { JWT_SECRET } from './auth';

interface SessionData {
  userId: number;
  userType: 'individual' | 'ngo' | 'company';
  email: string;
  name: string;
  preferences?: any;
  lastActivity: Date;
}

interface DeviceInfo {
  browser: string;
  os: string;
  device: string;
  isMobile: boolean;
}

export class SessionManager {
  private static SESSION_EXPIRES = parseInt(process.env.SESSION_MAX_AGE || '604800000'); // 7 days

  // Create new session
  static async createSession(
    userId: number, 
    userType: 'individual' | 'ngo' | 'company',
    email: string,
    name: string,
    request: NextRequest
  ): Promise<{ sessionId: string; token: string }> {
    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + this.SESSION_EXPIRES);
    
    // Extract device info
    const userAgent = request.headers.get('user-agent') || '';
    const ipAddress = this.getClientIP(request);
    const deviceInfo = this.parseUserAgent(userAgent);
    
    // Create session data
    const sessionData: SessionData = {
      userId,
      userType,
      email,
      name,
      lastActivity: new Date()
    };

    // Store session in database
    await executeQuery({
      query: `INSERT INTO user_sessions 
              (id, user_id, user_type, session_data, ip_address, user_agent, device_info, expires_at) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      values: [
        sessionId,
        userId,
        userType,
        JSON.stringify(sessionData),
        ipAddress,
        userAgent,
        JSON.stringify(deviceInfo),
        expiresAt
      ]
    });

    // Log successful login
    await this.logLoginActivity(userId, sessionId, ipAddress, userAgent, deviceInfo, 'success');

    // Create JWT token
    const token = jwt.sign(
      { sessionId, userId, userType, email },
      JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // Update user's last login
    await executeQuery({
      query: 'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
      values: [userId]
    });

    return { sessionId, token };
  }

  // Validate session
  static async validateSession(token: string): Promise<SessionData | null> {
    try {
      // Verify JWT
      const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
      const { sessionId, userId } = decoded;

      // Check session in database
      const sessions = await executeQuery({
        query: `SELECT * FROM user_sessions 
                WHERE id = ? AND user_id = ? AND is_active = true AND expires_at > NOW()`,
        values: [sessionId, userId]
      }) as any[];

      if (sessions.length === 0) {
        return null;
      }

      const session = sessions[0];
      const sessionData = JSON.parse(session.session_data);

      // Update last activity
      await executeQuery({
        query: 'UPDATE user_sessions SET last_activity = CURRENT_TIMESTAMP WHERE id = ?',
        values: [sessionId]
      });

      return sessionData;
    } catch (error) {
      console.error('Session validation error:', error);
      return null;
    }
  }

  // Destroy session
  static async destroySession(sessionId: string): Promise<void> {
    await executeQuery({
      query: 'UPDATE user_sessions SET is_active = false WHERE id = ?',
      values: [sessionId]
    });
  }

  // Destroy all user sessions (for logout from all devices)
  static async destroyAllUserSessions(userId: number): Promise<void> {
    await executeQuery({
      query: 'UPDATE user_sessions SET is_active = false WHERE user_id = ?',
      values: [userId]
    });
  }

  // Clean expired sessions
  static async cleanExpiredSessions(): Promise<void> {
    await executeQuery({
      query: 'DELETE FROM user_sessions WHERE expires_at < NOW() OR (last_activity < DATE_SUB(NOW(), INTERVAL 30 DAY))'
    });
  }

  // Get active sessions for user
  static async getUserActiveSessions(userId: number): Promise<any[]> {
    const sessions = await executeQuery({
      query: `SELECT id, device_info, ip_address, last_activity, created_at 
              FROM user_sessions 
              WHERE user_id = ? AND is_active = true AND expires_at > NOW()
              ORDER BY last_activity DESC`,
      values: [userId]
    }) as any[];

    return sessions.map(session => ({
      ...session,
      device_info: JSON.parse(session.device_info || '{}')
    }));
  }

  // Helper methods
  private static getClientIP(request: NextRequest): string {
    const forwarded = request.headers.get('x-forwarded-for');
    const real = request.headers.get('x-real-ip');
    const ip = forwarded?.split(',')[0] || real || 'unknown';
    return ip;
  }

  private static parseUserAgent(userAgent: string): DeviceInfo {
    // Simple user agent parsing - in production use a library like 'ua-parser-js'
    const isMobile = /Mobile|Android|iPhone|iPad/i.test(userAgent);
    const isWindows = /Windows/i.test(userAgent);
    const isMac = /Mac OS/i.test(userAgent);
    const isLinux = /Linux/i.test(userAgent);
    const isChrome = /Chrome/i.test(userAgent);
    const isFirefox = /Firefox/i.test(userAgent);
    const isSafari = /Safari/i.test(userAgent) && !/Chrome/i.test(userAgent);

    return {
      browser: isChrome ? 'Chrome' : isFirefox ? 'Firefox' : isSafari ? 'Safari' : 'Other',
      os: isWindows ? 'Windows' : isMac ? 'macOS' : isLinux ? 'Linux' : 'Other',
      device: isMobile ? 'Mobile' : 'Desktop',
      isMobile
    };
  }

  private static async logLoginActivity(
    userId: number,
    sessionId: string,
    ipAddress: string,
    userAgent: string,
    deviceInfo: DeviceInfo,
    status: 'success' | 'failed'
  ): Promise<void> {
    await executeQuery({
      query: `INSERT INTO login_history 
              (user_id, session_id, ip_address, user_agent, device_info, login_status) 
              VALUES (?, ?, ?, ?, ?, ?)`,
      values: [
        userId,
        sessionId,
        ipAddress,
        userAgent,
        JSON.stringify(deviceInfo),
        status
      ]
    });
  }
}