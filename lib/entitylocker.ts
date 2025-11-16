// EntityLocker API service for GST and PAN verification for NGOs and Companies
import crypto from 'crypto';

interface EntityLockerConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  baseUrl: string;
}

interface GSTData {
  gstNumber: string;
  businessName: string;
  address: string;
  status: string;
  registrationDate: string;
  businessType: string;
}

interface CompanyPANData {
  panNumber: string;
  name: string;
  registrationDate: string;
  entityType: string;
}

export class EntityLockerService {
  private config: EntityLockerConfig;
  private isConfigured: boolean;

  constructor() {
    this.config = {
      clientId: process.env.ENTITYLOCKER_CLIENT_ID || '',
      clientSecret: process.env.ENTITYLOCKER_CLIENT_SECRET || '',
      redirectUri: process.env.ENTITYLOCKER_REDIRECT_URI || 'http://localhost:3000/api/auth/entitylocker/callback',
      baseUrl: process.env.ENTITYLOCKER_BASE_URL || 'https://api.entitylocker.gov.in'
    };
    
    // Check if EntityLocker is properly configured
    this.isConfigured = !!(this.config.clientId && this.config.clientSecret);
    
    if (!this.isConfigured) {
      console.warn('EntityLocker API not configured. Add ENTITYLOCKER_CLIENT_ID and ENTITYLOCKER_CLIENT_SECRET to enable verification.');
    }
  }

  // Check if EntityLocker service is available
  isAvailable(): boolean {
    return this.isConfigured;
  }

  // Generate authorization URL for EntityLocker OAuth
  generateAuthUrl(userId: number, entityType: 'ngo' | 'company'): string {
    if (!this.isConfigured) {
      throw new Error('EntityLocker service not configured. Please add ENTITYLOCKER_CLIENT_ID and ENTITYLOCKER_CLIENT_SECRET environment variables.');
    }

    const state = this.generateState(userId, entityType);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      state: state,
      scope: 'gst pan cin'
    });

    return `${this.config.baseUrl}/public/oauth2/1/authorize?${params.toString()}`;
  }

  // Exchange authorization code for access token
  async exchangeCodeForToken(code: string, state: string): Promise<{
    accessToken: string;
    refreshToken: string;
    userId: number;
    entityType: string;
  }> {
    try {
      const response = await fetch(`${this.config.baseUrl}/public/oauth2/1/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          code: code,
          redirect_uri: this.config.redirectUri,
        }),
      });

      if (!response.ok) {
        throw new Error(`Token exchange failed: ${response.statusText}`);
      }

      const tokenData = await response.json();
      const { userId, entityType } = this.parseState(state);

      return {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        userId,
        entityType
      };
    } catch (error) {
      console.error('EntityLocker token exchange error:', error);
      throw error;
    }
  }

  // Fetch GST data from EntityLocker
  async fetchGSTData(accessToken: string, gstNumber: string): Promise<GSTData> {
    try {
      const response = await fetch(`${this.config.baseUrl}/public/rs/gst/details`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          gstin: gstNumber
        }),
      });

      if (!response.ok) {
        throw new Error(`GST fetch failed: ${response.statusText}`);
      }

      const gstData = await response.json();
      return this.parseGSTResponse(gstData);
    } catch (error) {
      console.error('EntityLocker GST fetch error:', error);
      throw error;
    }
  }

  // Fetch Company PAN data from EntityLocker
  async fetchCompanyPANData(accessToken: string, panNumber: string): Promise<CompanyPANData> {
    try {
      const response = await fetch(`${this.config.baseUrl}/public/rs/pan/details`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pan: panNumber
        }),
      });

      if (!response.ok) {
        throw new Error(`Company PAN fetch failed: ${response.statusText}`);
      }

      const panData = await response.json();
      return this.parsePANResponse(panData);
    } catch (error) {
      console.error('EntityLocker Company PAN fetch error:', error);
      throw error;
    }
  }

  // Fetch CIN data for companies
  async fetchCINData(accessToken: string, cinNumber: string): Promise<any> {
    try {
      const response = await fetch(`${this.config.baseUrl}/public/rs/cin/details`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cin: cinNumber
        }),
      });

      if (!response.ok) {
        throw new Error(`CIN fetch failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('EntityLocker CIN fetch error:', error);
      throw error;
    }
  }

  // Validate GST number format
  validateGSTNumber(gstNumber: string): boolean {
    const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    return gstRegex.test(gstNumber);
  }

  // Validate CIN number format
  validateCINNumber(cinNumber: string): boolean {
    const cinRegex = /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/;
    return cinRegex.test(cinNumber);
  }

  // Generate state parameter for OAuth
  private generateState(userId: number, entityType: string): string {
    const stateData = {
      userId,
      entityType,
      timestamp: Date.now(),
      nonce: crypto.randomBytes(16).toString('hex')
    };
    
    return Buffer.from(JSON.stringify(stateData)).toString('base64');
  }

  // Parse state parameter
  private parseState(state: string): { userId: number; entityType: string } {
    try {
      const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
      return {
        userId: stateData.userId,
        entityType: stateData.entityType
      };
    } catch (error) {
      throw new Error('Invalid state parameter');
    }
  }

  // Parse GST API response
  private parseGSTResponse(response: any): GSTData {
    return {
      gstNumber: response.gstin || '',
      businessName: response.tradeNam || response.lgnm || '',
      address: this.formatAddress(response.pradr || {}),
      status: response.sts || '',
      registrationDate: response.rgdt || '',
      businessType: response.ctb || ''
    };
  }

  // Parse PAN API response
  private parsePANResponse(response: any): CompanyPANData {
    return {
      panNumber: response.pan || '',
      name: response.name || '',
      registrationDate: response.registrationDate || '',
      entityType: response.entityType || ''
    };
  }

  // Format address from GST response
  private formatAddress(addressObj: any): string {
    const parts = [
      addressObj.addr?.bno || '',
      addressObj.addr?.bnm || '',
      addressObj.addr?.st || '',
      addressObj.addr?.loc || '',
      addressObj.addr?.dst || '',
      addressObj.addr?.stcd || '',
      addressObj.addr?.pncd || ''
    ].filter(part => part);

    return parts.join(', ');
  }
}