import { kvGet, kvSet } from './puterService';

export interface GeoLocation {
  country: string;
  countryCode: string;
  region: string;
  regionCode: string;
  city: string;
  latitude: number;
  longitude: number;
  timezone: string;
  isp?: string;
}

export interface RegionMapping {
  geoCountry: string;
  platformRegion: string;
  restrictions: string[];
}

// Country to region mapping for compliance
const COUNTRY_REGION_MAP: Record<string, RegionMapping> = {
  US: { geoCountry: 'US', platformRegion: 'us', restrictions: ['none'] },
  GB: { geoCountry: 'GB', platformRegion: 'uk', restrictions: ['gdpr_strict'] },
  DE: { geoCountry: 'DE', platformRegion: 'de', restrictions: ['gdpr_strict'] },
  FR: { geoCountry: 'FR', platformRegion: 'fr', restrictions: ['gdpr_strict'] },
  CA: { geoCountry: 'CA', platformRegion: 'ca', restrictions: ['pipeda'] },
  AU: { geoCountry: 'AU', platformRegion: 'au', restrictions: ['privacy_act'] },
  JP: { geoCountry: 'JP', platformRegion: 'jp', restrictions: ['apPI'] },
  CN: { geoCountry: 'CN', platformRegion: 'cn', restrictions: ['cybersecurity_law'] },
  IN: { geoCountry: 'IN', platformRegion: 'in', restrictions: ['it_act'] },
  BR: { geoCountry: 'BR', platformRegion: 'br', restrictions: ['lgpd'] },
  ES: { geoCountry: 'ES', platformRegion: 'es', restrictions: ['gdpr_strict'] },
  IT: { geoCountry: 'IT', platformRegion: 'it', restrictions: ['gdpr_strict'] },
  NL: { geoCountry: 'NL', platformRegion: 'nl', restrictions: ['gdpr_strict'] },
};

// Cache for IP lookups
const IP_CACHE_KEY = 'geoip_cache';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

class GeoIPService {
  private cache: Record<string, { data: GeoLocation; timestamp: number }> = {};

  /**
   * Get location from IP address
   * Uses public IP geolocation services
   */
  async getLocation(ip?: string): Promise<GeoLocation | null> {
    // Use provided IP or detect current
    const targetIp = ip || await this.getPublicIp();
    
    if (!targetIp) {
      return null;
    }

    // Check cache
    if (this.cache[targetIp] && Date.now() - this.cache[targetIp].timestamp < CACHE_TTL) {
      return this.cache[targetIp].data;
    }

    try {
      // Try multiple free geolocation services
      const location = await this.fetchGeoData(targetIp);
      
      if (location) {
        this.cache[targetIp] = { data: location, timestamp: Date.now() };
        return location;
      }
    } catch (error) {
      console.error('[GeoIP] Error fetching location:', error);
    }

    return null;
  }

  /**
   * Get public IP address
   */
  private async getPublicIp(): Promise<string | null> {
    try {
      // Use multiple services for redundancy
      const services = [
        'https://api.ipify.org?format=json',
        'https://api64.ipify.org?format=json',
      ];

      for (const service of services) {
        try {
          const response = await fetch(service);
          if (response.ok) {
            const data = await response.json();
            return data.ip;
          }
        } catch {
          continue;
        }
      }
    } catch {
      // Fallback
    }

    return null;
  }

  /**
   * Fetch geolocation data from IP
   * Uses ipapi.co as primary (free tier: 1000/day)
   */
  private async fetchGeoData(ip: string): Promise<GeoLocation | null> {
    try {
      // Primary: ipapi.co
      const response = await fetch(`https://ipapi.co/${ip}/json/`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      if (response.ok) {
        const data = await response.json();
        return {
          country: data.country_name || 'Unknown',
          countryCode: data.country_code || 'XX',
          region: data.region || 'Unknown',
          regionCode: data.region_code || '',
          city: data.city || 'Unknown',
          latitude: data.latitude || 0,
          longitude: data.longitude || 0,
          timezone: data.timezone || 'UTC',
          isp: data.org || undefined,
        };
      }
    } catch {
      // Continue to fallback
    }

    // Fallback: ipinfo.io (if configured)
    const ipinfoToken = await kvGet('ipinfo_token');
    if (ipinfoToken) {
      try {
        const response = await fetch(`https://ipinfo.io/${ip}/json?token=${ipinfoToken}`);
        if (response.ok) {
          const data = await response.json();
          const [lat, lon] = (data.loc || '0,0').split(',');
          return {
            country: data.country || 'Unknown',
            countryCode: data.country || 'XX',
            region: data.region || 'Unknown',
            regionCode: data.region || '',
            city: data.city || 'Unknown',
            latitude: parseFloat(lat) || 0,
            longitude: parseFloat(lon) || 0,
            timezone: data.timezone || 'UTC',
            isp: data.org || undefined,
          };
        }
      } catch {
        // Continue
      }
    }

    // Final fallback: free service
    try {
      const response = await fetch(`https://geolocation-db.com/json/${ip}`);
      if (response.ok) {
        const data = await response.json();
        return {
          country: data.country_name || 'Unknown',
          countryCode: data.country_code || 'XX',
          region: data.state || 'Unknown',
          regionCode: '',
          city: data.city || 'Unknown',
          latitude: data.latitude || 0,
          longitude: data.longitude || 0,
          timezone: 'UTC',
        };
      }
    } catch {
      // All failed
    }

    return null;
  }

  /**
   * Map country to platform region for compliance
   */
  getPlatformRegion(countryCode: string): string {
    const mapping = COUNTRY_REGION_MAP[countryCode];
    return mapping ? mapping.platformRegion : 'us';
  }

  /**
   * Get restrictions for a region
   */
  getRegionRestrictions(countryCode: string): string[] {
    const mapping = COUNTRY_REGION_MAP[countryCode];
    return mapping ? mapping.restrictions : [];
  }

  /**
   * Auto-detect region from request
   */
  async detectRegion(request?: Request): Promise<string> {
    let countryCode = 'US'; // Default

    try {
      // Try to get IP from request headers (when available)
      if (request) {
        const cfConnectingIp = request.headers.get('cf-connecting-ip');
        const xForwardedFor = request.headers.get('x-forwarded-for');
        
        const ip = cfConnectingIp || (xForwardedFor ? xForwardedFor.split(',')[0] : null);
        if (ip) {
          const location = await this.getLocation(ip.trim());
          if (location) {
            countryCode = location.countryCode;
          }
        }
      } else {
        // No request, use current IP
        const location = await this.getLocation();
        if (location) {
          countryCode = location.countryCode;
        }
      }
    } catch {
      // Use default
    }

    return this.getPlatformRegion(countryCode);
  }
}

export const geoIPService = new GeoIPService();