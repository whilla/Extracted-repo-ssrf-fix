export const dynamic = "force-dynamic";
import { NextResponse, type NextRequest } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import dns from 'node:dns/promises';
import net from 'node:net';


// Basic SSRF protection: allowed protocols and blocked hosts
const ALLOWED_PROTOCOLS = ['http:', 'https:'];
const BLOCKED_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0', '169.254.169.254', 'metadata.google.internal', 'metadata.azure.microsoft.com', 'instance-data'];

function isPrivateIP(ip: string): boolean {
  // IPv4 Private Ranges
  const ipv4PrivatePatterns = [
    /^127\./,               // Loopback
    /^10\./,                // Class A
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Class B
    /^192\.168\./,          // Class C
    /^169\.254\./,          // Link-local
    /^0\./,                 // This network
  ];

  if (net.isIPv4(ip)) {
    return ipv4PrivatePatterns.some(pattern => pattern.test(ip));
  }

  // IPv6 Private Ranges
  if (net.isIPv6(ip)) {
    const normalizedIp = ip.toLowerCase();
    return (
      normalizedIp === '::1' ||                 // Loopback
      normalizedIp.startsWith('fc00:') ||       // Unique Local Address (ULA)
      normalizedIp.startsWith('fd00:') ||       // ULA
      normalizedIp.startsWith('fe80:') ||       // Link-local
      normalizedIp.startsWith('fec0:') ||       // Site-local (deprecated)
      normalizedIp === '::'                     // Unspecified
    );
  }

  return true; // Treat unknown formats as private/invalid
}

async function validateTargetUrl(urlStr: string): Promise<{ valid: boolean; error?: string }> {
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
    try {
      const lookup = await dns.lookup(hostname, { all: false });
      const ip = lookup.address;
      if (isPrivateIP(ip)) {
        return { valid: false, error: 'Access to local or private networks is prohibited.' };
      }
    } catch (dnsError) {
      return { valid: false, error: 'Could not resolve hostname.' };
    }

    return { valid: true };
  } catch (e) {
    return { valid: false, error: 'Invalid URL format.' };
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');

    if (!targetUrl) {
      return NextResponse.json({ error: 'Missing target url parameter' }, { status: 400 });
    }

    const validation = await validateTargetUrl(targetUrl);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 403 });
    }

    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'NexusAI-Proxy/1.0',
      },
      redirect: 'error',
    });

    const data = await response.arrayBuffer();
    const contentType = response.headers.get('Content-Type') || 'application/octet-stream';

    return new NextResponse(data, {
      status: response.status,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: `Proxy request failed: ${error instanceof Error ? error.message : String(error)}` }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');

    if (!targetUrl) {
      return NextResponse.json({ error: 'Missing target url parameter' }, { status: 400 });
    }

    const validation = await validateTargetUrl(targetUrl);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 403 });
    }

    const body = await request.arrayBuffer();
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': request.headers.get('Content-Type') || 'application/json',
        'User-Agent': 'NexusAI-Proxy/1.0',
      },
      body,
      redirect: 'error',
    });

    const data = await response.arrayBuffer();
    const contentType = response.headers.get('Content-Type') || 'application/octet-stream';

    return new NextResponse(data, {
      status: response.status,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: `Proxy request failed: ${error instanceof Error ? error.message : String(error)}` }, { status: 502 });
  }
}
