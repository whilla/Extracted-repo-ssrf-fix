import { NextRequest, NextResponse } from 'next/server';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';
import { kvGet } from '@/lib/services/puterService';
import { getSupabaseAdminClient } from '@/lib/supabase/server';

const PLATFORMS = [
  'twitter', 'linkedin', 'instagram', 'facebook', 'tiktok',
  'youtube', 'reddit', 'discord', 'whatsapp', 'telegram',
  'snapchat', 'pinterest', 'threads',
];

export async function GET(request: NextRequest) {
  return withApiMiddleware(request, async ({ userId }) => {
    try {
      const connections: Record<string, { connected: boolean; lastConnected?: string }> = {};

      for (const platform of PLATFORMS) {
        let connected = false;
        let lastConnected: string | undefined;

        try {
          const supabase = await getSupabaseAdminClient();
          if (supabase && userId) {
            const { data } = await (supabase as any)
              .from('social_connections')
              .select('connected_at')
              .eq('user_id', userId)
              .eq('platform', platform)
              .single();

            if (data) {
              connected = true;
              lastConnected = data.connected_at;
            }
          }
        } catch {
          // Fallback to KV check
        }

        if (!connected) {
          const tokenKey = `${platform}_access_token`;
          const token = await kvGet(tokenKey);
          connected = !!token && token.length > 0;
        }

        connections[platform] = { connected, lastConnected };
      }

      return NextResponse.json({ success: true, connections });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Failed to fetch connections' },
        { status: 500 }
      );
    }
  }, { requireAuth: true });
}
