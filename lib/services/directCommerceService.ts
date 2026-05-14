import { kvGet } from './puterService';
import { sanitizeApiKey } from './providerCredentialUtils';
import { Product } from '@/lib/types';

export type CommercePlatform = 'shopify' | 'amazon' | 'etsy';

export interface CommerceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * DirectCommerceService provides first-party API integrations to read 
 * product catalogs from e-commerce platforms.
 */
export class DirectCommerceService {
  /**
   * Fetch products from a supported e-commerce platform
   * @param platform The platform to fetch from
   * @param query Optional search term for product names or descriptions
   */
  static async getProducts(platform: CommercePlatform, query?: string): Promise<CommerceResult<Product[]>> {
    try {
      switch (platform) {
        case 'shopify':
          return this.getShopifyProducts(query);
        case 'amazon':
          return this.getAmazonProducts(query);
        case 'etsy':
          return this.getEtsyProducts(query);
        default:
          return { success: false, error: `Commerce platform ${platform} not supported` };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown commerce error',
      };
    }
  }

  /**
   * Fetch products from Shopify Admin API
   * @param query Optional search term
   */
  static async getShopifyProducts(query?: string): Promise<CommerceResult<Product[]>> {
    try {
      const storeUrl = await kvGet('shopify_store_url');
      const accessToken = await sanitizeApiKey(await kvGet('shopify_access_token'));

      if (!storeUrl || !accessToken) {
        throw new Error('Shopify credentials not configured');
      }

      let endpoint = `https://${storeUrl}/admin/api/2024-01/products.json`;
      if (query) {
        endpoint += `?title=${encodeURIComponent(query)}`;
      }

      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.errors?.[0]?.message || `Shopify API error: ${response.statusText}`);
      }

      const data = await response.json();
      
      const products: Product[] = (data.products || []).map((p: any) => ({
        id: String(p.id),
        name: p.title,
        description: p.body_html || p.description || '',
        price: parseFloat(p.variants?.[0]?.price || '0'),
        currency: 'USD', // Typically would be configured in store settings
        imageUrl: p.image?.src,
        url: `https://${storeUrl}/products/${p.handle}`,
        metadata: {
          vendor: p.vendor,
          product_type: p.product_type,
        }
      }));

      return { success: true, data: products };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown Shopify error',
      };
    }
  }

  /**
   * Fetch products from Amazon Product Advertising API 5.0
   * Uses AWS Signature V4 for request signing.
   * @param query Optional search term
   */
  static async getAmazonProducts(query?: string): Promise<CommerceResult<Product[]>> {
    try {
      const apiKey = await sanitizeApiKey(await kvGet('amazon_api_key'));
      const secretKey = await kvGet('amazon_secret_key');
      const associateTag = await kvGet('amazon_associate_tag');
      const region = (await kvGet('amazon_region')) || 'us-east-1';
      
      if (!apiKey || !secretKey || !associateTag) {
        return { success: false, error: 'Amazon PA-API credentials not configured. Add amazon_api_key, amazon_secret_key, and amazon_associate_tag in Settings.' };
      }

      const host = `webservices.amazon.com`;
      const path = '/paapi5/searchitems';
      const service = 'ProductAdvertisingAPI';
      const amzDate = new Date().toISOString().replace(/[:-]/g, '').replace(/\.\d+/, '');
      const datestamp = amzDate.slice(0, 8);

      const payload = JSON.stringify({
        Keywords: query || 'All',
        Resources: ['Images.Primary.Medium', 'ItemInfo.Title', 'ItemInfo.Features', 'Offers.Listings.Price'],
        PartnerTag: associateTag,
        PartnerType: 'Associates',
        Marketplace: 'www.amazon.com',
        Operation: 'SearchItems',
      });

      const headers = {
        'content-encoding': 'amz-1.0',
        'content-type': 'application/json; charset=utf-8',
        'host': host,
        'x-amz-date': amzDate,
        'x-amz-target': `${service}.SearchItems`,
      };

      const canonicalHeaders = Object.entries(headers)
        .map(([k, v]) => `${k.toLowerCase()}:${v}\n`)
        .sort(([a], [b]) => a.localeCompare(b))
        .join('');

      const signedHeaders = Object.keys(headers)
        .map(k => k.toLowerCase())
        .sort()
        .join(';');

      const canonicalRequest = [
        'POST',
        path,
        '',
        canonicalHeaders,
        signedHeaders,
        'SHA256=' + await this.sha256(payload),
      ].join('\n');

      const credentialScope = `${datestamp}/${region}/${service}/aws4_request`;
      const stringToSign = [
        'AWS4-HMAC-SHA256',
        amzDate,
        credentialScope,
        await this.sha256(canonicalRequest),
      ].join('\n');

      const signingKey = await this.getSignatureKey(secretKey, datestamp, region, service);
      const signature = await this.hmacSha256Hex(signingKey, stringToSign);
      const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${apiKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

      const response = await fetch(`https://${host}${path}`, {
        method: 'POST',
        headers: {
          ...headers,
          'Authorization': authorizationHeader,
        },
        body: payload,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Amazon PA-API error: ${response.status} - ${errText}`);
      }

      const data = await response.json();
      const items = data?.SearchResult?.Items || [];

      const products: Product[] = items.map((item: any) => ({
        id: item.ASIN,
        name: item.ItemInfo?.Title?.DisplayValue || 'Unknown Product',
        description: (item.ItemInfo?.Features?.DisplayValues || []).join('\n'),
        price: parseFloat(item.Offers?.Listings?.[0]?.Price?.Amount || '0'),
        currency: item.Offers?.Listings?.[0]?.Price?.Currency || 'USD',
        imageUrl: item.Images?.Primary?.Medium?.URL,
        url: `https://www.amazon.com/dp/${item.ASIN}?tag=${associateTag}`,
        metadata: {
          category: item.ItemInfo?.Classifications?.Binding?.DisplayValue,
          brand: item.ItemInfo?.ByLineInfo?.Brand?.DisplayValue,
        },
      }));

      return { success: true, data: products };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown Amazon API error',
      };
    }
  }

  private static async sha256(str: string): Promise<string> {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private static async hmacSha256(key: BufferSource, str: string): Promise<ArrayBuffer> {
    const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(str));
  }

  private static async hmacSha256Hex(key: BufferSource, str: string): Promise<string> {
    const buf = await this.hmacSha256(key, str);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private static async getSignatureKey(key: string, dateStamp: string, regionName: string, serviceName: string): Promise<ArrayBuffer> {
    const kDate = await this.hmacSha256(new TextEncoder().encode('AWS4' + key), dateStamp);
    const kRegion = await this.hmacSha256(kDate, regionName);
    const kService = await this.hmacSha256(kRegion, serviceName);
    return this.hmacSha256(kService, 'aws4_request');
  }

  /**
   * Fetch products from Etsy API
   * @param query Optional search term
   */
  static async getEtsyProducts(query?: string): Promise<CommerceResult<Product[]>> {
    try {
      const apiKey = await sanitizeApiKey(await kvGet('etsy_api_key'));
      if (!apiKey) {
        return { success: false, error: 'Etsy API key not configured. Add etsy_api_key in Settings.' };
      }

      const endpoint = `https://openapi.etsy.com/v3/application/listings/active?limit=50${query ? `&keywords=${encodeURIComponent(query)}` : ''}`;

      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || `Etsy API error: ${response.statusText}`);
      }

      const data = await response.json();
      
      const products: Product[] = (data.results || []).map((p: any) => {
        const firstImage = p.images && p.images.length > 0 ? p.images[0].url : undefined;
        return {
          id: String(p.listing_id),
          name: p.title,
          description: p.description || '',
          price: parseFloat(p.price?.amount || '0'),
          currency: p.price?.currency_code || 'USD',
          imageUrl: firstImage,
          url: `https://www.etsy.com/listing/${p.listing_id}`,
          metadata: {
            shop_id: p.shop_id,
            tags: p.tags,
          }
        };
      });

      return { success: true, data: products };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown Etsy error',
      };
    }
  }
}
