import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import dns from "node:dns/promises";
import net from "node:net";

export const dynamic = "force-dynamic";

// Basic SSRF protection: allowed protocols and blocked hosts
const ALLOWED_PROTOCOLS = ["http:", "https:"];
const BLOCKED_HOSTS = ["localhost", "127.0.0.1", "0.0.0.0", "169.254.169.254"];

/**
 * Validates if an IP address is private, loopback, or reserved.
 */
function isPrivateIp(ip: string): boolean {
  if (!net.isIP(ip)) return true; // Treat invalid IPs as private/blocked

  if (ip === "::1" || ip === "0.0.0.0") return true;

  // IPv4 private ranges
  const ipv4Patterns = [
    /^127\./, // Loopback
    /^10\./, // Class A
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Class B
    /^192\.168\./, // Class C
    /^169\.254\./, // Link-local
  ];
  
  if (net.isIPv4(ip)) {
    return ipv4Patterns.some(pattern => pattern.test(ip));
  }

  // IPv6 private/local ranges
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    if (normalized === "::1") return true;
    if (normalized.startsWith("fc00:") || normalized.startsWith("fd00:")) return true; // ULA
    if (normalized.startsWith("fe80:")) return true; // Link-local
    if (normalized.includes("::ffff:")) {
      // Handle IPv4-mapped IPv6
      const ipv4Part = normalized.split("::ffff:")[1];
      return ipv4Part ? isPrivateIp(ipv4Part) : true;
    }
  }

  return false;
}

async function validateTargetUrl(urlStr: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const url = new URL(urlStr);
    if (!ALLOWED_PROTOCOLS.includes(url.protocol)) {
      return { valid: false, error: "Invalid protocol. Only HTTP and HTTPS are allowed." };
    }
    
    let hostname = url.hostname.toLowerCase();
    
    // Immediate block for known local hostnames
    if (BLOCKED_HOSTS.some(blocked => hostname === blocked || hostname.endsWith(`.${blocked}`))) {
      return { valid: false, error: "Access to local or private networks is prohibited." };
    }

    // Resolve hostname to IP to prevent DNS rebinding and bypasses
    const addresses = await dns.resolve(hostname).catch(() => []);
    
    if (addresses.length === 0) {
      return { valid: false, error: "Could not resolve hostname." };
    }

    // All resolved IPs must be public
    for (const ip of addresses) {
      if (isPrivateIp(ip)) {
        return { valid: false, error: `Access to private IP address ${ip} is prohibited.` };
      }
    }

    return { valid: true };
  } catch (e) {
    return { valid: false, error: "Invalid URL format." };
  }
}

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set(name, value, options);
          },
          remove(name: string, options: CookieOptions) {
            cookieStore.set(name, "", options);
          },
        },
      }
    );
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get("url");

    if (!targetUrl) {
      return NextResponse.json({ error: "Missing target url parameter" }, { status: 400 });
    }

    const validation = await validateTargetUrl(targetUrl);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 403 });
    }

    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "NexusAI-Proxy/1.0",
      },
    });

    const data = await response.arrayBuffer();
    const contentType = response.headers.get("Content-Type") || "application/octet-stream";

    return new NextResponse(data, {
      status: response.status,
      headers: {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: `Proxy request failed: ${error instanceof Error ? error.message : String(error)}` }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set(name, value, options);
          },
          remove(name: string, options: CookieOptions) {
            cookieStore.set(name, '', options);
          },
        },
      }
    );
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get("url");

    if (!targetUrl) {
      return NextResponse.json({ error: "Missing target url parameter" }, { status: 400 });
    }

    const validation = await validateTargetUrl(targetUrl);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 403 });
    }

    const body = await request.arrayBuffer();
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": request.headers.get("Content-Type") || "application/json",
        "User-Agent": "NexusAI-Proxy/1.0",
      },
      body,
    });

    const data = await response.arrayBuffer();
    const contentType = response.headers.get("Content-Type") || "application/octet-stream";

    return new NextResponse(data, {
      status: response.status,
      headers: {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: `Proxy request failed: ${error instanceof Error ? error.message : String(error)}` }, { status: 502 });
  }
}
