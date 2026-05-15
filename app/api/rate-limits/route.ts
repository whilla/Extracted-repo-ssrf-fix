import { NextResponse } from 'next/server';

export async function GET() {
  // In production, this would fetch actual rate limit data from services
  // For now, return mock data structure
  
  const limits = [
    {
      service: 'OpenAI',
      limit: 10000,
      remaining: 8500,
      resetAt: new Date(Date.now() + 3600000).toISOString(),
      usage: 1500,
      isNearLimit: false,
    },
    {
      service: 'Anthropic',
      limit: 5000,
      remaining: 4200,
      resetAt: new Date(Date.now() + 3600000).toISOString(),
      usage: 800,
      isNearLimit: false,
    },
    {
      service: 'Twitter/X',
      limit: 1500,
      remaining: 200,
      resetAt: new Date(Date.now() + 900000).toISOString(),
      usage: 1300,
      isNearLimit: true,
    },
  ];

  return NextResponse.json({ limits });
}
