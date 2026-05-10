'use client';

import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

export interface TranscriptEntry {
  timestamp: string;
  text: string;
}

export interface YouTubeTranscript {
  videoId: string;
  fullText: string;
  entries: TranscriptEntry[];
}

/**
 * YouTubeTranscriptService wraps the youtube-transcript skill to fetch
 * captions/transcripts from YouTube videos.
 */
export const youtubeTranscriptService = {
  /**
   * Fetches the transcript for a given YouTube video ID or URL.
   */
  async fetchTranscript(urlOrId: string): Promise<YouTubeTranscript> {
    try {
      // Execute the script from the skill location
      const { stdout } = await execPromise(`node /root/.pi/agent/skills/youtube-transcript/transcript.js "${urlOrId}"`);
      
      const lines = stdout.trim().split('\n');
      const entries: TranscriptEntry[] = [];
      let fullText = '';

      // Parse lines: [0:00] Text content
      const timestampRegex = /^\[(\d+:\d+(?::\d+)?)\]\s*(.*)$/;

      for (const line of lines) {
        const match = line.match(timestampRegex);
        if (match) {
          const [_, timestamp, text] = match;
          entries.push({ timestamp, text });
          fullText += text + ' ';
        }
      }

      if (entries.length === 0) {
        throw new Error('No valid transcript found. The video may not have captions available.');
      }

      // Extract video ID for tracking
      const videoId = this.extractVideoId(urlOrId);

      return {
        videoId,
        fullText: fullText.trim(),
        entries,
      };
    } catch (error) {
      console.error('[YouTubeTranscriptService] Error:', error);
      throw new Error(`Failed to fetch YouTube transcript: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  /**
   * Helper to extract the 11-character YouTube video ID.
   */
  extractVideoId(input: string): string {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e)=\s*//g;
    const match = input.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e)=)|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : input;
  }
};
