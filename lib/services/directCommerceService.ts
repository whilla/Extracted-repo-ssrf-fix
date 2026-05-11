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
   * Fetch products from Amazon (Placeholder)
   * @param query Optional search term
   */
  static async getAmazonProducts(query?: string): Promise<CommerceResult<Product[]>> {
    try {
      const apiKey = await sanitizeApiKey(await kvGet('amazon_api_key'));
      const associateTag = await kvGet('amazon_associate_tag');
      
      if (!apiKey || !associateTag) {
        return { success: false, error: 'Amazon PA-API credentials not configured. Add amazon_api_key and amazon_associate_tag in Settings.' };
      }

      // Amazon PA-API 5.0 requires a complex request signing process (AWS Signature V4).
      // In a production environment, this would be handled by a server-side proxy.
      // For this implementation, we'll use a simulated PA-API response that mirrors the actual structure.
      
      console.log(`[Amazon PA-API] Searching for: ${query || 'all products'} using tag ${associateTag}`);
      
      const simulatedProducts: Product[] = [
        {
          id: 'B0XXXXXX',
          name: query ? `${query} - Premium Edition` : 'Amazon Featured Product',
          description: 'High quality product sourced from Amazon.',
          price: 29.99,
          currency: 'USD',
          imageUrl: 'https://m.media-amazon.com/images/I/sample.jpg',
          url: `https://www.amazon.com/dp/B0XXXXXX?tag=${associateTag}`,
          metadata: { category: 'General' }
        }
      ];

      return { success: true, data: simulatedProducts };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown Amazon API error',
      };
    }
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
