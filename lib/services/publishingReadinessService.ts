

export function isPublicPublisherMediaUrl(url?: string): boolean {
  if (!url) return true;
  return /^https:\/\//i.test(url.trim());
}

export function getPublisherMediaBlockReason(url?: string): string | null {
  if (!url || isPublicPublisherMediaUrl(url)) return null;
  if (/^(blob:|data:)/i.test(url.trim())) {
    return 'Media is only available inside this browser session. Upload or persist it to a public HTTPS URL before publishing.';
  }
  return 'Media URL is not publicly reachable. Use a public HTTPS media URL before publishing.';
}

export function formatPostWithHashtags(content: string, hashtags?: string[]): string {
  const cleanContent = content.trim();
  const tagLine = (hashtags || [])
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith('#') ? tag : `#${tag}`))
    .join(' ')
    .trim();

  return [cleanContent, tagLine].filter(Boolean).join('\n\n');
}
