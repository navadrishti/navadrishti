import { NextRequest } from 'next/server';
import { supabase } from './db';
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
    await supabase
      .from('user_sessions')
      .insert({
        id: sessionId,
        user_id: userId,
        user_type: userType,
        session_data: JSON.stringify(sessionData),
        ip_address: ipAddress,
        user_agent: userAgent,
        device_info: JSON.stringify(deviceInfo),
        expires_at: expiresAt.toISOString(),
        is_active: true,
        created_at: new Date().toISOString(),
        last_activity: new Date().toISOString()
      });

    // Log successful login
    await this.logLoginActivity(userId, sessionId, ipAddress, userAgent, deviceInfo, 'success');

    // Create JWT token
    const token = jwt.sign(
      { sessionId, userId, userType, email },
      JWT_SECRET as string,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // Update user's last login
    await supabase
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', userId);

    return { sessionId, token };
  }

  // Validate session
  static async validateSession(token: string): Promise<SessionData | null> {
    try {
      // Verify JWT
      const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
      const { sessionId, userId } = decoded;

      // Check session in database
      const { data: sessions, error } = await supabase
        .from('user_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .eq('is_active', true)
        .gt('expires_at', new Date().toISOString());

      if (error || !sessions || sessions.length === 0) {
        return null;
      }

      const session = sessions[0];
      const sessionData = JSON.parse(session.session_data);

      // Update last activity
      await supabase
        .from('user_sessions')
        .update({ last_activity: new Date().toISOString() })
        .eq('id', sessionId);

      return sessionData;
    } catch (error) {
      console.error('Session validation error:', error);
      return null;
    }
  }

  // Destroy session
  static async destroySession(sessionId: string): Promise<void> {
    await supabase
      .from('user_sessions')
      .update({ is_active: false })
      .eq('id', sessionId);
  }

  // Destroy all user sessions (for logout from all devices)
  static async destroyAllUserSessions(userId: number): Promise<void> {
    await supabase
      .from('user_sessions')
      .update({ is_active: false })
      .eq('user_id', userId);
  }

  // Clean expired sessions
  static async cleanExpiredSessions(): Promise<void> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    await supabase
      .from('user_sessions')
      .delete()
      .or(`expires_at.lt.${new Date().toISOString()},last_activity.lt.${thirtyDaysAgo}`);
  }

  // Get active sessions for user
  static async getUserActiveSessions(userId: number): Promise<any[]> {
    const { data: sessions, error } = await supabase
      .from('user_sessions')
      .select('id, device_info, ip_address, last_activity, created_at')
      .eq('user_id', userId)
      .eq('is_active', true)
      .gt('expires_at', new Date().toISOString())
      .order('last_activity', { ascending: false });

    if (error || !sessions) {
      return [];
    }

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
    await supabase
      .from('login_history')
      .insert({
        user_id: userId,
        session_id: sessionId,
        ip_address: ipAddress,
        user_agent: userAgent,
        device_info: JSON.stringify(deviceInfo),
        login_status: status,
        created_at: new Date().toISOString()
      });
  }
}