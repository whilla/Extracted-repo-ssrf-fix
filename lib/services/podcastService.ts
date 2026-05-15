// Podcast Generation Service for NexusAI
// Converts text content into podcast episodes with multiple voices

import { kvGet, kvSet } from './puterService';

export interface PodcastConfig {
  title: string;
  description: string;
  author: string;
  language: string;
  explicit: boolean;
  category: string;
  imageUrl?: string;
}

export interface PodcastEpisode {
  id: string;
  title: string;
  description: string;
  content: string;
  voices: PodcastVoice[];
  duration?: number;
  audioUrl?: string;
  publishedAt: string;
  status: 'draft' | 'processing' | 'published' | 'failed';
}

export interface PodcastVoice {
  id: string;
  name: string;
  role: 'host' | 'cohost' | 'guest' | 'narrator';
  voiceId: string; // TTS voice ID
  segments: string[]; // Text segments this voice speaks
}

const PODCASTS_KEY = 'nexus_podcasts';
const EPISODES_KEY = 'nexus_podcast_episodes';

/**
 * Create a new podcast configuration
 */
export async function createPodcast(config: Omit<PodcastConfig, 'id'>): Promise<PodcastConfig & { id: string }> {
  const podcasts = await loadPodcasts();
  
  const newPodcast = {
    ...config,
    id: `podcast_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
  };
  
  podcasts.push(newPodcast);
  await savePodcasts(podcasts);
  
  return newPodcast;
}

/**
 * Load all podcasts
 */
export async function loadPodcasts(): Promise<Array<PodcastConfig & { id: string }>> {
  const data = await kvGet(PODCASTS_KEY);
  return data ? JSON.parse(data) : [];
}

/**
 * Save podcasts
 */
async function savePodcasts(podcasts: Array<PodcastConfig & { id: string }>): Promise<void> {
  await kvSet(PODCASTS_KEY, JSON.stringify(podcasts));
}

/**
 * Create a podcast episode from text content
 */
export async function createPodcastEpisode(
  podcastId: string,
  episode: Omit<PodcastEpisode, 'id' | 'publishedAt' | 'status'>
): Promise<PodcastEpisode> {
  const episodes = await loadEpisodes();
  
  const newEpisode: PodcastEpisode = {
    ...episode,
    id: `ep_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    publishedAt: new Date().toISOString(),
    status: 'draft',
  };
  
  episodes.push(newEpisode);
  await saveEpisodes(episodes);
  
  return newEpisode;
}

/**
 * Convert article/blog post to podcast script
 */
export function convertToPodcastScript(
  content: string,
  options: {
    intro?: string;
    outro?: string;
    hostName?: string;
    segments?: number;
  } = {}
): PodcastEpisode['voices'] {
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const segmentCount = options.segments || Math.ceil(sentences.length / 3);
  const segmentSize = Math.ceil(sentences.length / segmentCount);
  
  const segments: string[] = [];
  for (let i = 0; i < sentences.length; i += segmentSize) {
    segments.push(sentences.slice(i, i + segmentSize).join('. ') + '.');
  }
  
  const hostName = options.hostName || 'Host';
  
  return [
    {
      id: 'host',
      name: hostName,
      role: 'host',
      voiceId: 'default-host',
      segments: [
        options.intro || `Welcome to the show. Today we're discussing an interesting topic.`,
        ...segments.filter((_, i) => i % 2 === 0),
        options.outro || `Thanks for listening. See you next time!`,
      ],
    },
    {
      id: 'cohost',
      name: 'Co-Host',
      role: 'cohost',
      voiceId: 'default-cohost',
      segments: segments.filter((_, i) => i % 2 === 1),
    },
  ];
}

/**
 * Generate podcast audio using TTS
 */
export async function generatePodcastAudio(
  episode: PodcastEpisode,
  ttsProvider: (text: string, voiceId: string) => Promise<string>
): Promise<string | null> {
  try {
    const audioSegments: string[] = [];
    
    for (const voice of episode.voices) {
      for (const segment of voice.segments) {
        const audioUrl = await ttsProvider(segment, voice.voiceId);
        audioSegments.push(audioUrl);
      }
    }
    
    // In production, concatenate audio segments using FFmpeg or similar
    // For now, return the first segment URL
    return audioSegments[0] || null;
  } catch (error) {
    console.error('Podcast audio generation failed:', error);
    return null;
  }
}

/**
 * Load all episodes
 */
export async function loadEpisodes(): Promise<PodcastEpisode[]> {
  const data = await kvGet(EPISODES_KEY);
  return data ? JSON.parse(data) : [];
}

/**
 * Save episodes
 */
async function saveEpisodes(episodes: PodcastEpisode[]): Promise<void> {
  await kvSet(EPISODES_KEY, JSON.stringify(episodes));
}

/**
 * Get episodes for a podcast
 */
export async function getPodcastEpisodes(podcastId: string): Promise<PodcastEpisode[]> {
  const episodes = await loadEpisodes();
  return episodes
    .filter(e => e.id.startsWith(podcastId))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

/**
 * Generate podcast RSS feed (for Apple Podcasts, Spotify, etc.)
 */
export async function generatePodcastRSS(
  podcast: PodcastConfig & { id: string },
  episodes: PodcastEpisode[]
): Promise<string> {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(podcast.title)}</title>
    <description>${escapeXml(podcast.description)}</description>
    <link>${podcast.imageUrl || 'https://nexusai.app'}</link>
    <language>${podcast.language}</language>
    <itunes:author>${escapeXml(podcast.author)}</itunes:author>
    <itunes:category text="${escapeXml(podcast.category)}" />
    <itunes:explicit>${podcast.explicit ? 'yes' : 'no'}</itunes:explicit>
    ${podcast.imageUrl ? `<itunes:image href="${podcast.imageUrl}" />` : ''}
    <atom:link href="${podcast.imageUrl || 'https://nexusai.app'}/feed.xml" rel="self" type="application/rss+xml" />
    ${episodes.map(ep => `
    <item>
      <title>${escapeXml(ep.title)}</title>
      <description>${escapeXml(ep.description)}</description>
      <pubDate>${new Date(ep.publishedAt).toUTCString()}</pubDate>
      ${ep.audioUrl ? `<enclosure url="${ep.audioUrl}" type="audio/mpeg" />` : ''}
      <itunes:duration>${ep.duration || 0}</itunes:duration>
      <itunes:explicit>no</itunes:explicit>
    </item>`).join('\n')}
  </channel>
</rss>`;

  return xml;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
