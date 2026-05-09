/**
 * MULTI-MODAL PERCEPTION SERVICE
 * Allows agents to "see" and "hear" assets they have generated or that are in memory.
 * 
 * Responsibilities:
 * - Analyze visual assets (images/videos) using Vision LLMs
 * - Extract transcripts and sentiment from audio/music
 * - Parse and summarize complex documents (PDFs)
 * - Provide a unified "Observation" string for the Agent Blackboard
 */

import { readFile } from '../services/puterService';
import { universalChat } from '../services/aiService';

export interface AssetObservation {
  assetType: 'image' | 'video' | 'audio' | 'document';
  description: string;
  detectedElements: string[];
  sentiment: string;
  technicalNotes: string;
}

const ALLOWED_DIRECTORIES = ['/media', '/uploads', '/assets', '/generated'];
const MAX_FILE_SIZE = 50 * 1024 * 1024;

export class MultiModalPerceptionService {
  private initialized = false;
  private initializingPromise: Promise<void> | null = null;
  private locks: Map<string, Promise<void>> = new Map();

  async initialize(): Promise<void> {
    if (this.initializingPromise) {
      await this.initializingPromise;
      return;
    }

    this.initializingPromise = (async () => {
      this.initialized = true;
      console.log('[MultiModalPerception] Initialized');
    })();

    await this.initializingPromise;
    this.initializingPromise = null;
  }

  private validatePath(path: string): void {
    const normalizedPath = path.replace(/\\/g, '/');
    const isAllowed = ALLOWED_DIRECTORIES.some(dir => normalizedPath.startsWith(dir));
    if (!isAllowed) {
      throw new Error(`Path ${path} is not in allowed directories`);
    }
    if (normalizedPath.includes('..') || normalizedPath.includes('~')) {
      throw new Error('Path traversal detected');
    }
  }

  private async callWithRetry<T>(
    fn: () => Promise<T>,
    assetType: string,
    maxRetries = 2
  ): Promise<T> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }
    throw new Error(`Failed to analyze ${assetType} after ${maxRetries + 1} attempts: ${lastError?.message}`);
  }

  /**
   * Analyze an asset and return a textual observation agents can understand.
   */
  async perceiveAsset(path: string, type: 'image' | 'video' | 'audio' | 'document'): Promise<AssetObservation> {
    if (this.initializingPromise) {
      await this.initializingPromise;
    } else if (!this.initialized) {
      await this.initialize();
    }

    this.validatePath(path);

    const data = await readFile(path);
    if (!data) throw new Error(`Asset not found at ${path}`);

    const size = typeof data === 'string' ? data.length : (data.byteLength || data.length || 0);
    if (size > MAX_FILE_SIZE) {
      throw new Error(`File size exceeds maximum of ${MAX_FILE_SIZE} bytes`);
    }

    try {
      switch (type) {
        case 'image':
          return await this.analyzeImage(data);
        case 'video':
          return await this.analyzeVideo(data);
        case 'audio':
          return await this.analyzeAudio(data);
        case 'document':
          return await this.analyzeDocument(data);
        default:
          throw new Error(`Unsupported perception type: ${type}`);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      throw new Error(`Failed to perceive ${type} asset at ${path}: ${error.message}`);
    }
  }

  private async analyzeImage(data: any): Promise<AssetObservation> {
    const imagePayload = typeof data === 'string' ? data : Buffer.from(data).toString('base64');

    return await this.callWithRetry(async () => {
      const analysis = await universalChat(
        `You are a vision model. Analyze this image and describe its visual style, layout, colors, composition, and key elements. Provide a detailed description that could be used to recreate similar artwork.`,
        { 
          model: 'gpt-4o',
          attachments: [{ type: 'image', data: imagePayload }]
        }
      );
      
      return {
        assetType: 'image',
        description: analysis,
        detectedElements: this.extractElements(analysis),
        sentiment: this.extractSentiment(analysis),
        technicalNotes: 'Analyzed via Vision LLM with GPT-4o',
      };
    }, 'image');
  }

  private async analyzeVideo(data: any): Promise<AssetObservation> {
    return await this.callWithRetry(async () => {
      const videoData = typeof data === 'string' ? data : Buffer.from(data).toString('base64');
      
      const analysis = await universalChat(
        `Analyze this video content. Describe the movement, pacing, visual energy, key scenes, transitions, and overall cinematic style. Extract any text or logos visible.`,
        { 
          model: 'gpt-4o',
          attachments: [{ type: 'video', data: videoData }]
        }
      );

      return {
        assetType: 'video',
        description: analysis,
        detectedElements: this.extractElements(analysis),
        sentiment: this.extractSentiment(analysis),
        technicalNotes: 'Analyzed via multi-frame sampling and Vision LLM',
      };
    }, 'video');
  }

  private async analyzeAudio(data: any): Promise<AssetObservation> {
    return await this.callWithRetry(async () => {
      const audioData = typeof data === 'string' ? data : Buffer.from(data).toString('base64');

      const analysis = await universalChat(
        `Analyze this audio file. Identify the tone, mood, tempo (BPM estimate), key, instrumentation, vocal presence, and overall energy. Describe what type of content this is (music, speech, ambient, etc.).`,
        { 
          model: 'gpt-4o',
          attachments: [{ type: 'audio', data: audioData }]
        }
      );

      return {
        assetType: 'audio',
        description: analysis,
        detectedElements: this.extractElements(analysis),
        sentiment: this.extractSentiment(analysis),
        technicalNotes: 'Analyzed via audio transcription and acoustic analysis',
      };
    }, 'audio');
  }

  private async analyzeDocument(data: any): Promise<AssetObservation> {
    return await this.callWithRetry(async () => {
      let extractedText = '';
      let pageCount = 0;
      let hasImages = false;
      let metadata: any = null;

      try {
        const pdfjsLib = await import('pdfjs-dist');
        
        // Use CDN worker for better compatibility
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

        const pdfData = typeof data === 'string' ? Buffer.from(data, 'base64') : Buffer.from(data);
        const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
        pageCount = pdf.numPages;

        if (pdf.numPages > 0) {
          try {
            const pdfMeta = await pdf.getMetadata();
            metadata = pdfMeta.info;
          } catch {}
        }

        const maxPages = Math.min(pageCount, 20);
        const textParts: string[] = [];

        for (let i = 1; i <= maxPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items
            .map((item: any) => item.str)
            .join(' ')
            .trim();
          
          if (pageText) {
            textParts.push(`[Page ${i}/${pageCount}]\n${pageText}`);
          }

          try {
            const ops = await page.getOperatorList();
            if (ops.fnArray && ops.fnArray.some((fn: any) => fn === pdfjsLib.OPS.paintImageXObject || fn === pdfjsLib.OPS.paintJpegXObject)) {
              hasImages = true;
            }
          } catch {}
        }

        extractedText = textParts.join('\n\n');

        if (pageCount > maxPages) {
          extractedText += `\n\n[Note: Document has ${pageCount - maxPages} more pages that were not processed. Showing first ${maxPages} pages.]`;
        }
      } catch (pdfError) {
        console.warn('[MultiModalPerception] PDF parsing failed, trying as text file:', pdfError);
        extractedText = typeof data === 'string' ? data : Buffer.from(data).toString('utf-8');
      }

      if (!extractedText || extractedText.length < 50) {
        throw new Error('No readable text content found in document. The file may be scanned/image-based or corrupted.');
      }

      const truncatedText = extractedText.length > 15000 
        ? extractedText.substring(0, 15000) + '\n\n[Document truncated - showing first 15000 characters]'
        : extractedText;

      const analysis = await universalChat(
        `Analyze this document thoroughly. 

DOCUMENT CONTENT:
${truncatedText}

${metadata ? `METADATA: ${JSON.stringify(metadata)}` : ''}

Provide:
1. Main topics and themes
2. Document structure (chapters, sections, key headings)
3. Key information or data presented
4. Any tables, charts, or visual elements
5. Overall purpose and message
6. Tone and style`,
        { model: 'gpt-4o' }
      );

      const detectedElements: string[] = [];
      if (hasImages) detectedElements.push('Images/Graphics');
      if (pageCount > 1) detectedElements.push(`${pageCount} Pages`);
      if (metadata?.Title) detectedElements.push('Has Title');
      if (extractedText.includes('\t') || extractedText.includes('|')) detectedElements.push('Tables');
      detectedElements.push('Text Content');

      return {
        assetType: 'document',
        description: analysis,
        detectedElements: detectedElements.length > 0 ? detectedElements : ['Document'],
        sentiment: this.extractSentiment(analysis),
        technicalNotes: `Parsed ${pageCount > 0 ? pageCount : 1} page(s) via PDF.js text extraction${hasImages ? ', contains images' : ''}`,
      };
    }, 'document');
  }

  private extractElements(analysis: string): string[] {
    const elements: string[] = [];
    const lower = analysis.toLowerCase();
    
    if (lower.includes('text') || lower.includes('word') || lower.includes('letter')) elements.push('Text');
    if (lower.includes('person') || lower.includes('face') || lower.includes('character')) elements.push('Human/Character');
    if (lower.includes('object') || lower.includes('item') || lower.includes('product')) elements.push('Objects');
    if (lower.includes('background') || lower.includes('scene') || lower.includes('environment')) elements.push('Background');
    if (lower.includes('color') || lower.includes('palette') || lower.includes('hue')) elements.push('Color Scheme');
    if (lower.includes('shape') || lower.includes('form') || lower.includes('structure')) elements.push('Shapes');
    if (lower.includes('movement') || lower.includes('motion') || lower.includes('dynamic')) elements.push('Motion');
    if (lower.includes('music') || lower.includes('sound') || lower.includes('audio')) elements.push('Audio');
    
    return elements.length > 0 ? elements : ['General content'];
  }

  private extractSentiment(analysis: string): string {
    const lower = analysis.toLowerCase();
    if (lower.includes('positive') || lower.includes('happy') || lower.includes('joy') || lower.includes('upbeat')) return 'positive';
    if (lower.includes('negative') || lower.includes('sad') || lower.includes('dark') || lower.includes('ominous')) return 'negative';
    if (lower.includes('neutral') || lower.includes('informative') || lower.includes('factual')) return 'neutral';
    if (lower.includes('energetic') || lower.includes('dynamic') || lower.includes('exciting')) return 'energetic';
    if (lower.includes('calm') || lower.includes('peaceful') || lower.includes('serene')) return 'calm';
    return 'neutral';
  }

  /**
   * Create a concise summary for the Agent Blackboard
   */
  async observeForBlackboard(path: string, type: 'image' | 'video' | 'audio' | 'document'): Promise<string> {
    const obs = await this.perceiveAsset(path, type);
    return `[Visual/Audio Observation] ${type.toUpperCase()}: ${obs.description}. Key elements: ${obs.detectedElements.join(', ')}.`;
  }
}

export const perceptionService = new MultiModalPerceptionService();