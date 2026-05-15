// RSS Feed Generation Service for NexusAI
// Generates RSS feeds for blog content and published posts

import { loadMentions } from './socialListeningService';

export interface RSSFeedConfig {
  title: string;
  description: string;
  link: string;
  language: string;
  author: string;
  copyright: string;
  ttl: number; // Time to live in minutes
}

export interface RSSItem {
  title: string;
  description: string;
  link: string;
  pubDate: string;
  author?: string;
  category?: string[];
  enclosure?: {
    url: string;
    type: string;
    length: number;
  };
  content: string;
}

const DEFAULT_CONFIG: RSSFeedConfig = {
  title: 'NexusAI Content Feed',
  description: 'Latest content generated and published by NexusAI',
  link: 'https://nexusai.app',
  language: 'en-us',
  author: 'NexusAI',
  copyright: `Copyright ${new Date().getFullYear()} NexusAI. All rights reserved.`,
  ttl: 60,
};

/**
 * Escape XML special characters
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Format date for RSS
 */
function formatRSSDate(date: string): string {
  return new Date(date).toUTCString();
}

/**
 * Generate RSS 2.0 XML
 */
export function generateRSSFeed(
  items: RSSItem[],
  config: Partial<RSSFeedConfig> = {}
): string {
  const feedConfig = { ...DEFAULT_CONFIG, ...config };
  
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(feedConfig.title)}</title>
    <description>${escapeXml(feedConfig.description)}</description>
    <link>${feedConfig.link}</link>
    <language>${feedConfig.language}</language>
    <copyright>${escapeXml(feedConfig.copyright)}</copyright>
    <ttl>${feedConfig.ttl}</ttl>
    <atom:link href="${feedConfig.link}/feed.xml" rel="self" type="application/rss+xml" />
    <lastBuildDate>${formatRSSDate(new Date().toISOString())}</lastBuildDate>
    ${items.map(item => generateRSSItem(item)).join('\n    ')}
  </channel>
</rss>`;

  return xml;
}

/**
 * Generate a single RSS item
 */
function generateRSSItem(item: RSSItem): string {
  return `<item>
      <title>${escapeXml(item.title)}</title>
      <description>${escapeXml(item.description)}</description>
      <link>${item.link}</link>
      <pubDate>${formatRSSDate(item.pubDate)}</pubDate>
      <guid isPermaLink="true">${item.link}</guid>
      ${item.author ? `<author>${escapeXml(item.author)}</author>` : ''}
      ${item.category ? item.category.map(cat => `<category>${escapeXml(cat)}</category>`).join('\n      ') : ''}
      ${item.enclosure ? `<enclosure url="${item.enclosure.url}" length="${item.enclosure.length}" type="${item.enclosure.type}" />` : ''}
      <content:encoded><![CDATA[${item.content}]]></content:encoded>
    </item>`;
}

/**
 * Generate RSS feed from published posts
 */
export async function generatePostsRSSFeed(
  posts: Array<{
    title: string;
    content: string;
    url: string;
    publishedAt: string;
    author?: string;
    platform?: string;
  }>,
  config: Partial<RSSFeedConfig> = {}
): Promise<string> {
  const items: RSSItem[] = posts.map(post => ({
    title: post.title,
    description: post.content.substring(0, 500) + (post.content.length > 500 ? '...' : ''),
    link: post.url,
    pubDate: post.publishedAt,
    author: post.author,
    category: post.platform ? [post.platform] : undefined,
    content: post.content,
  }));

  return generateRSSFeed(items, config);
}

/**
 * Generate RSS feed for a specific platform
 */
export async function generatePlatformRSSFeed(
  platform: string,
  posts: Array<{
    title: string;
    content: string;
    url: string;
    publishedAt: string;
  }>,
  config: Partial<RSSFeedConfig> = {}
): Promise<string> {
  const platformConfig = {
    ...DEFAULT_CONFIG,
    title: `${platform} Posts - NexusAI`,
    description: `Latest ${platform} posts from NexusAI`,
    ...config,
  };

  return generatePostsRSSFeed(posts, platformConfig);
}

/**
 * Generate Atom feed (alternative to RSS)
 */
export function generateAtomFeed(
  items: Array<{
    title: string;
    content: string;
    url: string;
    publishedAt: string;
    author?: string;
  }>,
  config: Partial<RSSFeedConfig> = {}
): string {
  const feedConfig = { ...DEFAULT_CONFIG, ...config };
  
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(feedConfig.title)}</title>
  <subtitle>${escapeXml(feedConfig.description)}</subtitle>
  <link href="${feedConfig.link}" rel="alternate" />
  <link href="${feedConfig.link}/feed.atom" rel="self" />
  <updated>${formatRSSDate(new Date().toISOString())}</updated>
  <id>${feedConfig.link}</id>
  ${items.map(item => `
  <entry>
    <title>${escapeXml(item.title)}</title>
    <link href="${item.url}" rel="alternate" />
    <id>${item.url}</id>
    <published>${formatRSSDate(item.publishedAt)}</published>
    <updated>${formatRSSDate(item.publishedAt)}</updated>
    ${item.author ? `<author><name>${escapeXml(item.author)}</name></author>` : ''}
    <content type="html"><![CDATA[${item.content}]]></content>
  </entry>`).join('\n')}
</feed>`;

  return xml;
}
