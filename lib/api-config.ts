export const API_CONFIG = {
  mediaStack: {
    key: process.env.MEDIASTACK_API_KEY,
    baseUrl: 'https://api.mediastack.com/v1/news',
    cacheTTL: 30 * 60 * 1000,
  },
  serpStack: {
    key: process.env.SERPSTACK_API_KEY,
    baseUrl: 'https://api.serpstack.com/search',
    cacheTTL: 60 * 60 * 1000,
  },
  userStack: {
    key: process.env.USERSTACK_API_KEY,
    baseUrl: 'https://api.userstack.com',
    cacheTTL: 24 * 60 * 60 * 1000,
  },
  ipStack: {
    key: process.env.IPSTACK_API_KEY,
    baseUrl: 'https://api.ipstack.com',
    cacheTTL: 24 * 60 * 60 * 1000,
  },
  numVerify: {
    key: process.env.NUMVERIFY_API_KEY,
    baseUrl: 'https://apilayer.net/api/numverify',
    cacheTTL: 0,
  },
};

export function getApiKey(service: keyof typeof API_CONFIG): string | undefined {
  return API_CONFIG[service].key;
}

export function isServiceConfigured(service: keyof typeof API_CONFIG): boolean {
  return !!API_CONFIG[service].key;
}
