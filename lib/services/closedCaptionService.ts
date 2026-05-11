import { aiService } from './aiService';
import { kvGet } from './puterService';

export interface CaptionSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

export interface ClosedCaptionResult {
  segments: CaptionSegment[];
  srtContent: string;
  vttContent: string;
  languages: string[];
  translatedCaptions?: Record<string, CaptionSegment[]>;
}

export interface TranslationResult {
  language: string;
  segments: CaptionSegment[];
  srtContent: string;
  vttContent: string;
}

const SUPPORTED_LANGUAGES = ['es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh', 'ar', 'hi'];

export const closedCaptionService = {
  async generateCaptions(videoUrl: string, options?: {
    language?: string;
    includeSpeakers?: boolean;
    maxCharsPerLine?: number;
  }): Promise<ClosedCaptionResult> {
    const {
      language = 'en',
      includeSpeakers = false,
      maxCharsPerLine = 42,
    } = options || {};

    try {
      const systemPrompt = `
        You are an expert speech-to-text transcriptionist and accessibility specialist.
        Your task is to:
        1. Watch the video and transcribe the spoken content
        2. Create properly timed caption segments (start/end in seconds)
        3. Format text to be readable (max ${maxCharsPerLine} characters per line)
        4. Detect speaker changes when possible
        
        Return a JSON object with:
        {
          "segments": [
            { "start": 0.0, "end": 2.5, "text": "Hello everyone", "speaker": "Host" },
            ...
          ],
          "languages": ["original language detected"]
        }
      `;

      const response = await aiService.chat([
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Transcribe this video and create closed captions. Target language: ${language}` },
            { type: 'video_url', video_url: { url: videoUrl } }
          ]
        }
      ]);

      const cleaned = response.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);

      const segments = (parsed.segments || []).map((s: any) => ({
        start: Number(s.start) || 0,
        end: Number(s.end) || 0,
        text: (s.text || '').slice(0, 200),
        speaker: includeSpeakers ? s.speaker : undefined,
      }));

      return {
        segments,
        srtContent: this.segmentsToSRT(segments),
        vttContent: this.segmentsToVTT(segments),
        languages: parsed.languages || [language],
      };
    } catch (error) {
      console.error('[ClosedCaptionService] Caption generation failed:', error);
      return {
        segments: [],
        srtContent: '',
        vttContent: '',
        languages: [],
      };
    }
  },

  async generateCaptionsFromTranscript(transcript: string, options?: {
    language?: string;
    speakerHints?: string[];
  }): Promise<ClosedCaptionResult> {
    const {
      language = 'en',
      speakerHints = [],
    } = options || {};

    try {
      const systemPrompt = `
        Convert this transcript into properly timed closed captions.
        
        Analyze the content and estimate timing:
        - Average speaking rate: ~150-180 words per minute
        - Shorter sentences = shorter time segments
        - Pause between topics = longer gaps
        
        Return JSON with:
        {
          "segments": [
            { "start": 0.0, "end": 3.5, "text": "Segment text", "speaker": "Optional" },
            ...
          ],
          "languages": ["${language}"]
        }
      `;

      const response = await aiService.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Convert this transcript to timed captions:\n\n${transcript}` }
      ]);

      const cleaned = response.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);

      const segments = (parsed.segments || []).map((s: any) => ({
        start: Number(s.start) || 0,
        end: Number(s.end) || 0,
        text: (s.text || '').slice(0, 200),
        speaker: speakerHints.length > 0 ? s.speaker : undefined,
      }));

      return {
        segments,
        srtContent: this.segmentsToSRT(segments),
        vttContent: this.segmentsToVTT(segments),
        languages: [language],
      };
    } catch (error) {
      console.error('[ClosedCaptionService] Transcript conversion failed:', error);
      return {
        segments: [],
        srtContent: '',
        vttContent: '',
        languages: [language],
      };
    }
  },

  async translateCaptions(
    captions: CaptionSegment[],
    targetLanguage: string
  ): Promise<TranslationResult> {
    if (!SUPPORTED_LANGUAGES.includes(targetLanguage.toLowerCase())) {
      throw new Error(`Unsupported language: ${targetLanguage}. Supported: ${SUPPORTED_LANGUAGES.join(', ')}`);
    }

    try {
      const systemPrompt = `
        Translate these captions to ${targetLanguage}.
        Maintain the same timing and segment structure.
        Keep speaker labels in original language.
        
        Return JSON:
        {
          "segments": [
            { "start": 0.0, "end": 2.5, "text": "Translated text", "speaker": "Original" },
            ...
          ]
        }
      `;

      const captionsJson = JSON.stringify(captions);
      const response = await aiService.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Translate to ${targetLanguage}:\n${captionsJson}` }
      ]);

      const cleaned = response.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);

      const segments = (parsed.segments || []).map((s: any) => ({
        start: Number(s.start) || 0,
        end: Number(s.end) || 0,
        text: (s.text || '').slice(0, 200),
        speaker: s.speaker,
      }));

      return {
        language: targetLanguage,
        segments,
        srtContent: this.segmentsToSRT(segments),
        vttContent: this.segmentsToVTT(segments),
      };
    } catch (error) {
      console.error('[ClosedCaptionService] Translation failed:', error);
      throw error;
    }
  },

  segmentsToSRT(segments: CaptionSegment[]): string {
    return segments.map((seg, i) => {
      const start = this.formatSRTTime(seg.start);
      const end = this.formatSRTTime(seg.end);
      const text = seg.text;
      return `${i + 1}\n${start} --> ${end}\n${text}\n`;
    }).join('\n');
  },

  segmentsToVTT(segments: CaptionSegment[]): string {
    const header = 'WEBVTT\n\n';
    const cues = segments.map(seg => {
      const start = this.formatVTTTime(seg.start);
      const end = this.formatVTTTime(seg.end);
      const speaker = seg.speaker ? `<cSpeaker>${seg.speaker}</cSpeaker>\n` : '';
      return `${start} --> ${end}\n${speaker}${seg.text}\n`;
    }).join('\n');
    return header + cues;
  },

  formatSRTTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  },

  formatVTTTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  },

  wrapCaptionsWithStyle(vttContent: string, style?: {
    fontSize?: string;
    fontColor?: string;
    backgroundColor?: string;
    textAlign?: 'left' | 'center' | 'right';
  }): string {
    const {
      fontSize = '120%',
      fontColor = 'white',
      backgroundColor = 'rgba(0,0,0,0.7)',
      textAlign = 'center',
    } = style || {};

    const styleBlock = `
STYLE
::cue {
  font-size: ${fontSize};
  color: ${fontColor};
  background-color: ${backgroundColor};
  text-align: ${textAlign};
}
`;

    return vttContent.replace('WEBVTT', `WEBVTT\n\n${styleBlock}`);
  },
};
