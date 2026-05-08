export const dynamic = "force-dynamic";
import { NextResponse, type NextRequest } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import dns from 'node:dns/promises';
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
  if (net.isIPv6(ip)) {
    // Expand common IPv6 shorthand notations for comparison
    // Handle :: which can represent multiple zeros
    const expanded = normalizedIp
      .replace(/::/g, expandIPv6Zeros(normalizedIp))
      .replace(/:/g, '');
    
    return (
      normalizedIp === '::1' ||                     // Loopback
      normalizedIp === '::' ||                      // Unspecified address
      normalizedIp.startsWith('fc00:') ||           // Unique Local Address (ULA)
      normalizedIp.startsWith('fd00:') ||           // ULA (RFC 4193)
      normalizedIp === '0:0:0:0:0:0:0:0' ||         // Unspecified (expanded ::)
      normalizedIp.startsWith('fe80:') ||           // Link-local (RFC 4291)
      normalizedIp.startsWith('fec0:') ||           // Site-local (deprecated, RFC 3879)
      normalizedIp.startsWith('ff00:') ||             // Multicast
      normalizedIp.startsWith('2001:db8:') ||      // Documentation (RFC 3849)
      normalizedIp.startsWith('2001:10:') ||         // Deprecated (RFC 7421)
      normalizedIp.startsWith('2001:20:') ||         // ORCHID (RFC 7343)
      // Handle expanded loopback forms like 0:0:0:0:0:0:0:1
      normalizedIp.match(/^0(:0){7}1$/) !== null
    );
  }

  // Unknown format - treat as private for safety
  return true;
}

// Helper function to expand IPv6 zero compression (::)
function expandIPv6Zeros(ip: string): string {
  // Count the number of zero groups represented by ::
  const parts = ip.split(':');
  const zeroCount = 8 - parts.length + 1; // 8 total groups in IPv6
  return ':'.repeat(Math.max(0, zeroCount) * 5); // Each group is 4 hex digits + colon
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

    // DNS Rebinding Protection: Re-resolve hostname and verify IP hasn't changed
    try {
      const url = new URL(targetUrl);
      const secondLookup = await dns.lookup(url.hostname, { all: false });
      if (secondLookup.address !== validation.resolvedIP) {
        return NextResponse.json({ error: 'DNS rebinding attack detected.' }, { status: 403 });
      }
    } catch (e) {
      return NextResponse.json({ error: 'DNS verification failed.' }, { status: 403 });
    }

    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'NexusAI-Proxy/1.0',
      },
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

    // DNS Rebinding Protection: Re-resolve hostname and verify IP hasn't changed
    try {
      const url = new URL(targetUrl);
      const secondLookup = await dns.lookup(url.hostname, { all: false });
      if (secondLookup.address !== validation.resolvedIP) {
        return NextResponse.json({ error: 'DNS rebinding attack detected.' }, { status: 403 });
      }
    } catch (e) {
      return NextResponse.json({ error: 'DNS verification failed.' }, { status: 403 });
    }

    const body = await request.arrayBuffer();
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': request.headers.get('Content-Type') || 'application/json',
        'User-Agent': 'NexusAI-Proxy/1.0',
      },
      body,
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
