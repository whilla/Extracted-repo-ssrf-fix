import { beforeAll } from 'vitest';

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-pub-key';
  (process.env as any).NODE_ENV = 'test';
});
