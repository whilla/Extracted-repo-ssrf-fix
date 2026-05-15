import { API_CONFIG, getApiKey } from '@/lib/api-config';
import { kvGet } from './puterService';
import { logger } from '@/lib/utils/logger';

export interface GeoData {
  ip: string;
  city: string;
  region: string;
  country_name: string;
  country_code: string;
  latitude: number;
  longitude: number;
  timezone: string;
  zip: string;
  continent_code: string;
  region_code: string;
}

const GEO_CACHE = new Map<string, { data: GeoData; expiresAt: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000;

async function getIpStackKey(): Promise<string | null> {
  const envKey = getApiKey('ipStack');
  if (envKey) return envKey;
  const stored = await kvGet('ipstack_api_key');
  return stored || null;
}

export async function getUserLocation(ip?: string): Promise<GeoData | null> {
  const cacheKey = ip || 'default';
  const cached = GEO_CACHE.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  const key = await getIpStackKey();
  if (!key) {
    logger.warn('IPStack', 'IPStack API key not configured');
    return null;
  }

  try {
    const targetIp = ip || '';
    const baseUrl = API_CONFIG.ipStack.baseUrl;
    const url = `${baseUrl}/${targetIp}?access_key=${key}&fields=main`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });

    if (!response.ok) {
      logger.error('IPStack', `API error: ${response.statusText}`);
      return null;
    }

    const data = await response.json();

    if (data.error) {
      logger.error('IPStack', `API returned error: ${data.error.message}`);
      return null;
    }

    const geoData: GeoData = {
      ip: data.ip || '',
      city: data.city || '',
      region: data.region_name || '',
      country_name: data.country_name || '',
      country_code: data.country_code || '',
      latitude: data.latitude || 0,
      longitude: data.longitude || 0,
      timezone: data.time_zone?.id || '',
      zip: data.zip || '',
      continent_code: data.continent_code || '',
      region_code: data.region_code || '',
    };

    GEO_CACHE.set(cacheKey, { data: geoData, expiresAt: Date.now() + CACHE_TTL });
    return geoData;
  } catch (error) {
    logger.error('IPStack', 'Error fetching location', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export function detectRegionFromCountry(countryCode: string): string | null {
  const mapping: Record<string, string> = {
    US: 'us',
    GB: 'uk',
    CA: 'ca',
    AU: 'au',
    JP: 'jp',
    CN: 'cn',
    IN: 'in',
    BR: 'br',
    DE: 'de',
    FR: 'fr',
    ES: 'es',
    IT: 'eu',
    NL: 'eu',
    BE: 'eu',
    AT: 'eu',
    SE: 'eu',
    NO: 'eu',
    DK: 'eu',
    FI: 'eu',
    IE: 'eu',
    PT: 'eu',
    PL: 'eu',
    CZ: 'eu',
    HU: 'eu',
    RO: 'eu',
    BG: 'eu',
    HR: 'eu',
    SK: 'eu',
    SI: 'eu',
    LT: 'eu',
    LV: 'eu',
    EE: 'eu',
    LU: 'eu',
    MT: 'eu',
    CY: 'eu',
    GR: 'eu',
  };
  return mapping[countryCode.toUpperCase()] || null;
}

export async function detectUserRegion(ip?: string): Promise<string | null> {
  const geo = await getUserLocation(ip);
  if (!geo?.country_code) return null;
  return detectRegionFromCountry(geo.country_code);
}

export function clearGeoCache(): void {
  GEO_CACHE.clear();
}
