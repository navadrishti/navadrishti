// DigiLocker API service for Aadhaar and PAN verification
import crypto from 'crypto';

interface DigiLockerConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  baseUrl: string;
}

interface AadhaarData {
  aadhaarNumber: string;
  name: string;
  dateOfBirth: string;
  address: {
    street: string;
    city: string;
    state: string;
    pincode: string;
  };
  photo?: string;
}

interface PANData {
  panNumber: string;
  name: string;
  fatherName: string;
  dateOfBirth: string;
}

export class DigiLockerService {
  private config: DigiLockerConfig;
  private isConfigured: boolean;

  constructor() {
    this.config = {
      clientId: process.env.DIGILOCKER_CLIENT_ID || '',
      clientSecret: process.env.DIGILOCKER_CLIENT_SECRET || '',
      redirectUri: process.env.DIGILOCKER_REDIRECT_URI || 'http://localhost:3000/api/auth/digilocker/callback',
      baseUrl: process.env.DIGILOCKER_BASE_URL || 'https://api.digitallocker.gov.in'
    };
    
    // Check if DigiLocker is properly configured
    this.isConfigured = !!(this.config.clientId && this.config.clientSecret);
    
    if (!this.isConfigured) {
      console.warn('DigiLocker API not configured. Add DIGILOCKER_CLIENT_ID and DIGILOCKER_CLIENT_SECRET to enable verification.');
    }
  }

  // Check if DigiLocker service is available
  isAvailable(): boolean {
    return this.isConfigured;
  }

  // Generate authorization URL for DigiLocker OAuth
  generateAuthUrl(userId: number, documentType: 'aadhaar' | 'pan'): string {
    if (!this.isConfigured) {
      throw new Error('DigiLocker service not configured. Please add DIGILOCKER_CLIENT_ID and DIGILOCKER_CLIENT_SECRET environment variables.');
    }

    const state = this.generateState(userId, documentType);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      state: state,
      scope: 'aadhaar pan'
    });

    return `${this.config.baseUrl}/public/oauth2/1/authorize?${params.toString()}`;
  }

  // Exchange authorization code for access token
  async exchangeCodeForToken(code: string, state: string): Promise<{
    accessToken: string;
    refreshToken: string;
    userId: number;
    documentType: string;
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
      const { userId, documentType } = this.parseState(state);

      return {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        userId,
        documentType
      };
    } catch (error) {
      console.error('DigiLocker token exchange error:', error);
      throw error;
    }
  }

  // Fetch Aadhaar data from DigiLocker
  async fetchAadhaarData(accessToken: string): Promise<AadhaarData> {
    try {
      const response = await fetch(`${this.config.baseUrl}/public/rs/xml`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          uri: 'in.gov.uidai.aadhaar',
          doctype: 'ADHAR'
        }),
      });

      if (!response.ok) {
        throw new Error(`Aadhaar fetch failed: ${response.statusText}`);
      }

      const xmlData = await response.text();
      return this.parseAadhaarXML(xmlData);
    } catch (error) {
      console.error('DigiLocker Aadhaar fetch error:', error);
      throw error;
    }
  }

  // Fetch PAN data from DigiLocker
  async fetchPANData(accessToken: string): Promise<PANData> {
    try {
      const response = await fetch(`${this.config.baseUrl}/public/rs/xml`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          uri: 'in.gov.incometax.pan',
          doctype: 'PANCA'
        }),
      });

      if (!response.ok) {
        throw new Error(`PAN fetch failed: ${response.statusText}`);
      }

      const xmlData = await response.text();
      return this.parsePANXML(xmlData);
    } catch (error) {
      console.error('DigiLocker PAN fetch error:', error);
      throw error;
    }
  }

  // Verify Aadhaar number format
  validateAadhaarNumber(aadhaarNumber: string): boolean {
    const cleanAadhaar = aadhaarNumber.replace(/\s/g, '');
    return /^\d{12}$/.test(cleanAadhaar);
  }

  // Verify PAN number format
  validatePANNumber(panNumber: string): boolean {
    return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(panNumber);
  }

  // Generate state parameter for OAuth
  private generateState(userId: number, documentType: string): string {
    const stateData = {
      userId,
      documentType,
      timestamp: Date.now(),
      nonce: crypto.randomBytes(16).toString('hex')
    };
    
    return Buffer.from(JSON.stringify(stateData)).toString('base64');
  }

  // Parse state parameter
  private parseState(state: string): { userId: number; documentType: string } {
    try {
      const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
      return {
        userId: stateData.userId,
        documentType: stateData.documentType
      };
    } catch (error) {
      throw new Error('Invalid state parameter');
    }
  }

  // Parse Aadhaar XML response
  private parseAadhaarXML(xmlData: string): AadhaarData {
    // This is a simplified parser - in production, use a proper XML parser
    // The actual XML structure will depend on DigiLocker's response format
    
    const aadhaarMatch = xmlData.match(/<uid>(.*?)<\/uid>/);
    const nameMatch = xmlData.match(/<name>(.*?)<\/name>/);
    const dobMatch = xmlData.match(/<dob>(.*?)<\/dob>/);
    const addressMatch = xmlData.match(/<addr>(.*?)<\/addr>/);

    return {
      aadhaarNumber: aadhaarMatch ? aadhaarMatch[1] : '',
      name: nameMatch ? nameMatch[1] : '',
      dateOfBirth: dobMatch ? dobMatch[1] : '',
      address: {
        street: '',
        city: '',
        state: '',
        pincode: ''
      }
    };
  }

  // Parse PAN XML response
  private parsePANXML(xmlData: string): PANData {
    // This is a simplified parser - in production, use a proper XML parser
    
    const panMatch = xmlData.match(/<pan>(.*?)<\/pan>/);
    const nameMatch = xmlData.match(/<name>(.*?)<\/name>/);
    const fatherNameMatch = xmlData.match(/<father_name>(.*?)<\/father_name>/);
    const dobMatch = xmlData.match(/<dob>(.*?)<\/dob>/);

    return {
      panNumber: panMatch ? panMatch[1] : '',
      name: nameMatch ? nameMatch[1] : '',
      fatherName: fatherNameMatch ? fatherNameMatch[1] : '',
      dateOfBirth: dobMatch ? dobMatch[1] : ''
    };
  }
}