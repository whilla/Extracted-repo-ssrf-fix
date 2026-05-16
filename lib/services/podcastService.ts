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
  voiceId: string;
  segments: string[];
}

const PODCASTS_KEY = 'nexus_podcasts';
const EPISODES_KEY = 'nexus_podcast_episodes';

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

export async function loadPodcasts(): Promise<Array<PodcastConfig & { id: string }>> {
  const data = await kvGet(PODCASTS_KEY);
  return data ? JSON.parse(data) : [];
}

async function savePodcasts(podcasts: Array<PodcastConfig & { id: string }>): Promise<void> {
  await kvSet(PODCASTS_KEY, JSON.stringify(podcasts));
}

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
    
    if (audioSegments.length === 0) {
      return null;
    }
    
    const wavUrl = await concatenateAudioSegments(audioSegments);
    return wavUrl;
  } catch (error) {
    console.error('Podcast audio generation failed:', error);
    return null;
  }
}

export async function concatenateAudioSegments(audioUrls: string[]): Promise<string | null> {
  const audioContext = new AudioContext();
  const buffers: AudioBuffer[] = [];
  
  for (const url of audioUrls) {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    buffers.push(audioBuffer);
  }
  
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0);
  const sampleRate = buffers[0].sampleRate;
  const numberOfChannels = buffers[0].numberOfChannels;
  
  const concatenated = audioContext.createBuffer(numberOfChannels, totalLength, sampleRate);
  
  let offset = 0;
  for (const buffer of buffers) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sourceData = buffer.getChannelData(channel);
      const destData = concatenated.getChannelData(channel);
      destData.set(sourceData, offset);
    }
    offset += buffer.length;
  }
  
  const wavBlob = audioBuffersToWav(concatenated);
  const wavUrl = URL.createObjectURL(wavBlob);
  
  await audioContext.close();
  
  return wavUrl;
}

export function audioBuffersToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const length = buffer.length;
  const dataSize = length * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;
  
  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);
  
  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, 'WAVE');
  
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(buffer.getChannelData(ch));
  }
  
  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }
  
  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

export async function loadEpisodes(): Promise<PodcastEpisode[]> {
  const data = await kvGet(EPISODES_KEY);
  return data ? JSON.parse(data) : [];
}

async function saveEpisodes(episodes: PodcastEpisode[]): Promise<void> {
  await kvSet(EPISODES_KEY, JSON.stringify(episodes));
}

export async function getPodcastEpisodes(podcastId: string): Promise<PodcastEpisode[]> {
  const episodes = await loadEpisodes();
  return episodes
    .filter(e => e.id.startsWith(podcastId))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

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
