export const dynamic = "force-dynamic";
import { NextResponse, type NextRequest } from 'next/server';
import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';


// Basic SSRF protection: allowed protocols and blocked hosts
const ALLOWED_PROTOCOLS = ['http:', 'https:'];
const BLOCKED_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0', '169.254.169.254', 'metadata.google.internal', 'metadata.azure.microsoft.com', 'instance-data'];

// Robust IP validation with proper IPv6 normalization
function isPrivateIP(ip: string): boolean {
  // Normalize the IP address for consistent comparison
  let normalizedIp = ip.trim().toLowerCase();
  
  // Handle IPv4-mapped IPv6 addresses (::ffff:127.0.0.1 -> 127.0.0.1)
  if (normalizedIp.startsWith('::ffff:')) {
    normalizedIp = normalizedIp.substring(7);
  }
  
  // IPv4 Private Ranges
  const ipv4PrivatePatterns = [
    /^127\./,               // Loopback
    /^10\./,                // Class A private
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Class B private
    /^192\.168\./,          // Class C private
    /^169\.254\./,          // Link-local
    /^0\./,                 // This network (current network)
  ];

  if (net.isIPv4(normalizedIp)) {
    return ipv4PrivatePatterns.some(pattern => pattern.test(normalizedIp));
  }

  // IPv6 Private/Reserved Ranges (RFC 4291, RFC 6146, RFC 6147)
  if (net.isIPv6(normalizedIp)) {
    return (
      normalizedIp === '::1' ||                     // Loopback
      normalizedIp === '::' ||                      // Unspecified address
      normalizedIp.startsWith('fc00:') ||           // Unique Local Address (ULA)
      normalizedIp.startsWith('fd00:') ||           // ULA (RFC 4193)
      normalizedIp === '0:0:0:0:0:0:0:0' ||         // Unspecified (expanded ::)
      normalizedIp.startsWith('fe80:') ||           // Link-local (RFC 4291)
      normalizedIp.startsWith('fec0:') ||           // Site-local (deprecated, RFC 3879)
      /^ff[0-9a-f]{2}:/.test(normalizedIp) ||        // Multicast (ff00::/8)
      normalizedIp.startsWith('2001:db8:') ||      // Documentation (RFC 3849)
      normalizedIp.startsWith('2001:10:') ||         // Deprecated (RFC 7421)
      normalizedIp.startsWith('2001:20:') ||         // ORCHID (RFC 7343)
      normalizedIp === '0:0:0:0:0:0:0:1'             // Expanded loopback
    );
  }

  // Unknown format - treat as private for safety
  return true;
}

async function getProxyUser() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return { error: NextResponse.json({ error: 'Supabase not configured' }, { status: 503 }) };
  }

  try {
    const [supabaseModule, headersModule] = await Promise.all([
      import('@supabase/ssr'),
      import('next/headers')
    ]);
    const { createServerClient } = supabaseModule;
    const { cookies } = headersModule;
    const cookieStore = await cookies();
    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet: any[]) {
            try {
              cookiesToSet.forEach(({ name, value, options }: any) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Ignore cookie set errors
            }
          },
        },
      }
    );
    const result = await supabase.auth.getUser();
    const user = result?.data?.user;
    if (!user) {
      return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    }
    return { user };
  } catch (authError) {
    console.error('Auth error:', authError);
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
}

function buildPinnedTargetUrl(targetUrl: string, resolvedIP: string) {
  const url = new URL(targetUrl);
  return {
    url,
    lookup(hostname: string, options: any, callback: any) {
      const family = net.isIPv6(resolvedIP) ? 6 : 4;
      callback(null, resolvedIP, family);
    },
  };
}

async function proxyRequest(
  targetUrl: string,
  resolvedIP: string,
  options: { method?: string; headers?: Record<string, string>; body?: Buffer } = {}
) {
  const { url, lookup } = buildPinnedTargetUrl(targetUrl, resolvedIP);
  const client = url.protocol === 'https:' ? https : http;

  const TIMEOUT_MS = 30_000;
  const MAX_BODY_SIZE = 10 * 1024 * 1024;

  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
    const req = client.request(
      url,
      {
        method: options.method || 'GET',
        headers: options.headers,
        lookup,
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let totalSize = 0;
        res.on('data', (chunk) => {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          totalSize += buf.length;
          if (totalSize > MAX_BODY_SIZE) {
            req.destroy(new Error('Response body too large'));
            return;
          }
          chunks.push(buf);
        });
        res.on('error', reject);
        res.on('end', () => {
          resolve({
            status: res.statusCode || 502,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      }
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('Request timeout'));
    });
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function validateTargetUrl(urlStr: string): Promise<{ valid: boolean; error?: string; resolvedIP?: string }> {
  try {
    const url = new URL(urlStr);
    if (!ALLOWED_PROTOCOLS.includes(url.protocol)) {
      return { valid: false, error: 'Invalid protocol. Only HTTP and HTTPS are allowed.' };
    }
    const hostname = url.hostname.toLowerCase();
    
    if (BLOCKED_HOSTS.some(blocked => hostname === blocked || hostname.endsWith(`.${blocked}`))) {
      return { valid: false, error: 'Access to this host is prohibited.' };
    }

    // DNS Resolution and IP Validation
    let resolvedIP: string | undefined;
    try {
      const lookup = await dns.lookup(hostname, { all: false });
      resolvedIP = lookup.address;
      if (isPrivateIP(resolvedIP)) {
        return { valid: false, error: 'Access to local or private networks is prohibited.' };
      }
    } catch (dnsError) {
      return { valid: false, error: 'Could not resolve hostname.' };
    }

    return { valid: true, resolvedIP };
  } catch (e) {
    return { valid: false, error: 'Invalid URL format.' };
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getProxyUser();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');

    if (!targetUrl) {
      return NextResponse.json({ error: 'Missing target url parameter' }, { status: 400 });
    }

    const validation = await validateTargetUrl(targetUrl);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 403 });
    }
    if (!validation.resolvedIP) {
      return NextResponse.json({ error: 'DNS verification failed.' }, { status: 403 });
    }

    const response = await proxyRequest(targetUrl, validation.resolvedIP, {
      headers: {
        'User-Agent': 'NexusAI-Proxy/1.0',
      },
    });

    const contentType = response.headers['content-type'] || 'application/octet-stream';

    return new NextResponse(response.body, {
      status: response.status,
      headers: {
        'Content-Type': Array.isArray(contentType) ? contentType[0] : contentType,
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: `Proxy request failed: ${error instanceof Error ? error.message : String(error)}` }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getProxyUser();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');

    if (!targetUrl) {
      return NextResponse.json({ error: 'Missing target url parameter' }, { status: 400 });
    }

    const validation = await validateTargetUrl(targetUrl);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 403 });
    }
    if (!validation.resolvedIP) {
      return NextResponse.json({ error: 'DNS verification failed.' }, { status: 403 });
    }

    const body = Buffer.from(await request.arrayBuffer());
    const response = await proxyRequest(targetUrl, validation.resolvedIP, {
      method: 'POST',
      headers: {
        'Content-Type': request.headers.get('Content-Type') || 'application/json',
        'User-Agent': 'NexusAI-Proxy/1.0',
      },
      body,
    });

    const contentType = response.headers['content-type'] || 'application/octet-stream';

    return new NextResponse(response.body, {
      status: response.status,
      headers: {
        'Content-Type': Array.isArray(contentType) ? contentType[0] : contentType,
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: `Proxy request failed: ${error instanceof Error ? error.message : String(error)}` }, { status: 502 });
  }
}
