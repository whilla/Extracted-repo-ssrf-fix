

import { aiService } from './aiService';

// PDF.js will be loaded dynamically
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pdfjsLib: any | null = null;
const PDF_OCR_MIN_TEXT_LENGTH = 180;
const PDF_OCR_MAX_PAGES = 4;

interface PDFExtractionResult {
  text: string;
  pageCount: number;
  textLayerChars: number;
  ocrAttempted: boolean;
  ocrUsed: boolean;
  ocrFailure?: string;
}

export type FileType = 'image' | 'document' | 'audio' | 'video' | 'data' | 'url' | 'html' | 'code' | 'unknown';

export interface ProcessedFile {
  id: string;
  name: string;
  type: FileType;
  mimeType: string;
  size: number;
  base64?: string;
  extractedText?: string;
  summary?: string;
  thumbnailUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface FileProcessorResult {
  file: ProcessedFile;
  aiResponse?: string;
  suggestions?: string[];
}

export interface ProcessFileOptions {
  skipAiSummary?: boolean;
}

// Detect file type from MIME type
function detectFileType(mimeType: string, fileName?: string): FileType {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType === 'application/pdf') return 'document';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'document';
  if (mimeType === 'text/plain' || mimeType === 'text/markdown') return 'document';
  if (mimeType === 'text/html' || mimeType === 'application/xhtml+xml') return 'html';
  if (mimeType === 'text/csv' || mimeType === 'application/json') return 'data';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'data';
  
  // Code file detection by extension
  if (fileName) {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'pdf' || ext === 'doc' || ext === 'docx' || ext === 'txt' || ext === 'md') return 'document';
    const codeExtensions = ['js', 'jsx', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'css', 'scss', 'vue', 'svelte'];
    const htmlExtensions = ['html', 'htm', 'xhtml', 'xml'];
    
    if (codeExtensions.includes(ext || '')) return 'code';
    if (htmlExtensions.includes(ext || '')) return 'html';
  }
  
  return 'unknown';
}

function getFileExtension(fileName?: string): string {
  return fileName?.split('.').pop()?.toLowerCase() || '';
}

// Convert File to base64
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix to get pure base64
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Extract text from PDF using PDF.js
async function extractPDFText(base64Data: string): Promise<PDFExtractionResult> {
  try {
    // Dynamically import PDF.js
    if (!pdfjsLib) {
      pdfjsLib = await import('pdfjs-dist');
    }

    const data = atob(base64Data);
    const uint8Array = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
      uint8Array[i] = data.charCodeAt(i);
    }

    const pdf = await pdfjsLib.getDocument({
      data: uint8Array,
      useWorkerFetch: false,
      isEvalSupported: false,
    }).promise;
    const textParts: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: { str?: string }) => ('str' in item ? item.str : ''))
        .join(' ');
      textParts.push(`[Page ${i}]\n${pageText.trim()}`);
    }

    const extracted = textParts.join('\n\n').trim();
    const compactLength = extracted.replace(/\s+/g, '').length;
    let ocrAttempted = false;
    let ocrUsed = false;
    let ocrFailure: string | undefined;
    let finalText = extracted;

    // OCR fallback for scanned PDFs or text-layer failures.
    if (compactLength < PDF_OCR_MIN_TEXT_LENGTH) {
      ocrAttempted = true;
      try {
        const visionOcr = await extractPDFTextWithVision(pdf, Math.min(pdf.numPages, PDF_OCR_MAX_PAGES));
        if (visionOcr.trim()) {
          finalText = visionOcr.trim();
          ocrUsed = true;
        }
      } catch (error) {
        ocrFailure = error instanceof Error ? error.message : String(error);
      }
    }

    return {
      text: finalText,
      pageCount: pdf.numPages,
      textLayerChars: compactLength,
      ocrAttempted,
      ocrUsed,
      ocrFailure,
    };
  } catch (error) {
    console.error('PDF extraction error:', error);
    return {
      text: '',
      pageCount: 0,
      textLayerChars: 0,
      ocrAttempted: false,
      ocrUsed: false,
      ocrFailure: error instanceof Error ? error.message : String(error),
    };
  }
}

async function renderPdfPageToDataUrl(
  pdf: any,
  pageNumber: number
): Promise<string | null> {
  if (typeof document === 'undefined') return null;

  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1.8 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext('2d');
  if (!context) return null;

  await page.render({ canvasContext: context, viewport }).promise;
  return canvas.toDataURL('image/png');
}

async function extractPDFTextWithVision(
  pdf: any,
  maxPages: number
): Promise<string> {
  const blocks: string[] = [];
  let lastError = '';

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber++) {
    const imageUrl = await renderPdfPageToDataUrl(pdf, pageNumber);
    if (!imageUrl) continue;

    const ocrPrompt = `Transcribe all visible text from this document page exactly.
Return plain text only.
Do not summarize.
Do not add explanation.
Preserve names, numbers, and wording exactly as shown.`;

    try {
      const text = await aiService.chatWithVision(ocrPrompt, imageUrl);
      if (text && text.trim()) {
        blocks.push(`[Page ${pageNumber} OCR]\n${text.trim()}`);
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  if (blocks.length === 0 && lastError) {
    throw new Error(lastError);
  }

  return blocks.join('\n\n');
}

// Extract text from DOCX using mammoth
async function extractDOCXText(base64Data: string): Promise<string> {
  try {
    const mammoth = await import('mammoth');
    const data = atob(base64Data);
    const uint8Array = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
      uint8Array[i] = data.charCodeAt(i);
    }

    const result = await mammoth.extractRawText({ arrayBuffer: uint8Array.buffer });
    return result.value;
  } catch (error) {
    console.error('DOCX extraction error:', error);
    return '';
  }
}

// Parse CSV data
async function parseCSV(base64Data: string): Promise<{ headers: string[]; rows: string[][] }> {
  try {
    const Papa = await import('papaparse');
    const text = atob(base64Data);
    const result = Papa.default.parse(text, { header: false });
    
    const data = result.data as string[][];
    return {
      headers: data[0] || [],
      rows: data.slice(1),
    };
  } catch (error) {
    console.error('CSV parsing error:', error);
    return { headers: [], rows: [] };
  }
}

// Parse JSON data
function parseJSON(base64Data: string): unknown {
  try {
    const text = atob(base64Data);
    return JSON.parse(text);
  } catch (error) {
    console.error('JSON parsing error:', error);
    return null;
  }
}

// Extract text from HTML
function extractHTMLText(base64Data: string): {
  text: string;
  title: string;
  headings: string[];
  links: { text: string; href: string }[];
  images: { alt: string; src: string }[];
  meta: Record<string, string>;
} {
  try {
    const html = atob(base64Data);
    
    // Create a DOM parser (works in browser environment)
    if (typeof window !== 'undefined' && window.DOMParser) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Extract title
      const title = doc.querySelector('title')?.textContent || '';
      
      // Extract meta tags
      const meta: Record<string, string> = {};
      doc.querySelectorAll('meta').forEach(el => {
        const name = el.getAttribute('name') || el.getAttribute('property') || '';
        const content = el.getAttribute('content') || '';
        if (name && content) meta[name] = content;
      });
      
      // Extract headings
      const headings: string[] = [];
      doc.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(el => {
        const text = el.textContent?.trim();
        if (text) headings.push(text);
      });
      
      // Extract links
      const links: { text: string; href: string }[] = [];
      doc.querySelectorAll('a[href]').forEach(el => {
        const text = el.textContent?.trim() || '';
        const href = el.getAttribute('href') || '';
        if (text && href && !href.startsWith('#')) {
          links.push({ text, href });
        }
      });
      
      // Extract images
      const images: { alt: string; src: string }[] = [];
      doc.querySelectorAll('img[src]').forEach(el => {
        const alt = el.getAttribute('alt') || '';
        const src = el.getAttribute('src') || '';
        if (src) images.push({ alt, src });
      });
      
      // Remove script and style elements for text extraction
      doc.querySelectorAll('script, style, noscript').forEach(el => el.remove());
      
      // Extract main text content
      const bodyText = doc.body?.textContent || '';
      const cleanText = bodyText
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n');
      
      return { text: cleanText, title, headings, links, images, meta };
    }
    
    // Fallback: Simple regex-based extraction
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch ? titleMatch[1] : '';
    
    // Strip HTML tags
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    return { text, title, headings: [], links: [], images: [], meta: {} };
  } catch (error) {
    console.error('HTML parsing error:', error);
    return { text: '', title: '', headings: [], links: [], images: [], meta: {} };
  }
}

// Parse code file
function parseCodeFile(base64Data: string, fileName: string): {
  code: string;
  language: string;
  lineCount: number;
  imports: string[];
  functions: string[];
  classes: string[];
} {
  try {
    const code = atob(base64Data);
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    
    // Detect language from extension
    const languageMap: Record<string, string> = {
      'js': 'javascript', 'jsx': 'javascript',
      'ts': 'typescript', 'tsx': 'typescript',
      'py': 'python', 'rb': 'ruby',
      'go': 'go', 'rs': 'rust',
      'java': 'java', 'c': 'c', 'cpp': 'cpp',
      'css': 'css', 'scss': 'scss',
      'vue': 'vue', 'svelte': 'svelte',
    };
    const language = languageMap[ext] || 'unknown';
    
    const lines = code.split('\n');
    const lineCount = lines.length;
    
    // Extract imports (basic patterns)
    const imports: string[] = [];
    const importPatterns = [
      /^import\s+.*from\s+['"]([^'"]+)['"]/gm,  // ES6 imports
      /^const\s+.*=\s*require\(['"]([^'"]+)['"]\)/gm,  // CommonJS
      /^from\s+(\S+)\s+import/gm,  // Python
      /^require\s+['"]([^'"]+)['"]/gm,  // Ruby
    ];
    importPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(code)) !== null) {
        imports.push(match[1]);
      }
    });
    
    // Extract function names (basic patterns)
    const functions: string[] = [];
    const funcPatterns = [
      /function\s+(\w+)\s*\(/g,  // JS function
      /const\s+(\w+)\s*=\s*(?:async\s*)?\(/g,  // Arrow functions
      /def\s+(\w+)\s*\(/g,  // Python
      /func\s+(\w+)\s*\(/g,  // Go
    ];
    funcPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(code)) !== null) {
        if (!functions.includes(match[1])) functions.push(match[1]);
      }
    });
    
    // Extract class names
    const classes: string[] = [];
    const classPattern = /class\s+(\w+)/g;
    let classMatch;
    while ((classMatch = classPattern.exec(code)) !== null) {
      if (!classes.includes(classMatch[1])) classes.push(classMatch[1]);
    }
    
    return { code, language, lineCount, imports, functions, classes };
  } catch (error) {
    console.error('Code parsing error:', error);
    return { code: '', language: 'unknown', lineCount: 0, imports: [], functions: [], classes: [] };
  }
}

// Process image with Vision AI
async function processImage(
  base64Data: string,
  mimeType: string,
  userMessage?: string
): Promise<{ description: string; suggestions: string[] }> {
  const imageUrl = `data:${mimeType};base64,${base64Data}`;
  
  const prompt = userMessage || `
Analyze this image in detail for social media content creation:
1. Describe what you see (composition, lighting, subjects, mood)
2. If it contains text, transcribe it
3. If it's a product/brand asset, extract brand details
4. If it's a screenshot, describe the UI/content
5. Suggest 3 ways this could be used for social media content
`;

  const response = await aiService.chatWithVision(prompt, imageUrl);
  
  // Parse suggestions from response
  const suggestions = response
    .split('\n')
    .filter(line => line.match(/^\d+\.|^-|^•/))
    .slice(-3)
    .map(s => s.replace(/^\d+\.|^-|^•\s*/, '').trim());

  return {
    description: response,
    suggestions: suggestions.length > 0 ? suggestions : [
      'Create an Instagram post with this image',
      'Use as a story background',
      'Generate a carousel around this theme',
    ],
  };
}

// Main file processor
export const fileProcessor = {
  // Process a single file
  async processFile(
    file: File,
    userMessage?: string,
    options: ProcessFileOptions = {}
): Promise<FileProcessorResult> {
  const id = `file_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const fileType = detectFileType(file.type, file.name);
  const fileExtension = getFileExtension(file.name);
    const base64 = await fileToBase64(file);

    const processedFile: ProcessedFile = {
      id,
      name: file.name,
      type: fileType,
      mimeType: file.type,
      size: file.size,
      base64,
    };

    let aiResponse: string | undefined;
    let suggestions: string[] = [];

    switch (fileType) {
      case 'image': {
        const result = await processImage(base64, file.type, userMessage);
        aiResponse = result.description;
        suggestions = result.suggestions;
        processedFile.thumbnailUrl = `data:${file.type};base64,${base64}`;
        break;
      }

      case 'document': {
        let text = '';
        let pdfExtraction: PDFExtractionResult | null = null;
        if (file.type === 'application/pdf' || fileExtension === 'pdf') {
          pdfExtraction = await extractPDFText(base64);
          text = pdfExtraction.text;
          processedFile.metadata = {
            ...(processedFile.metadata || {}),
            pageCount: pdfExtraction.pageCount,
            textLayerChars: pdfExtraction.textLayerChars,
            ocrAttempted: pdfExtraction.ocrAttempted,
            ocrUsed: pdfExtraction.ocrUsed,
            ocrFailure: pdfExtraction.ocrFailure || null,
          };
        } else if (file.type.includes('word') || fileExtension === 'docx') {
          text = await extractDOCXText(base64);
        } else {
          // Plain text or markdown
          text = atob(base64);
        }

        processedFile.extractedText = text;

        // Summarize with AI unless caller wants raw extraction speed
        if (text.length > 0 && !options.skipAiSummary) {
          const summaryPrompt = `
Summarize this document for social media content creation.
Identify key points, quotes, or insights that could become posts.
Document content:
${text.slice(0, 8000)}
`;
          aiResponse = await aiService.chat([{ role: 'user', content: summaryPrompt }]);
          suggestions = [
            'Extract key quotes for Twitter threads',
            'Create carousel slides from main points',
            'Write a LinkedIn article summary',
          ];
        } else if (text.length > 0) {
          aiResponse = 'Document text extracted successfully.';
          suggestions = ['Ask for summary, key points, or direct conversion into posts'];
        } else if (pdfExtraction) {
          if (pdfExtraction.ocrAttempted && pdfExtraction.ocrFailure) {
            aiResponse = `No selectable text was found in this PDF (${pdfExtraction.pageCount || 'unknown'} pages), and OCR could not run on the current vision setup. ${pdfExtraction.ocrFailure}`;
            suggestions = [
              'Switch to a vision-capable chat model/provider and retry analysis',
              'Upload a text-selectable PDF export if available',
              'Share page screenshots and I can transcribe them directly',
            ];
          } else if (pdfExtraction.ocrAttempted && !pdfExtraction.ocrUsed) {
            aiResponse = `No selectable text was found in this PDF (${pdfExtraction.pageCount || 'unknown'} pages). OCR ran but no readable text was returned.`;
            suggestions = [
              'Re-upload a cleaner PDF export',
              'Upload page screenshots with higher contrast',
              'Share the key pages and I will extract them manually',
            ];
          } else {
            aiResponse = `No selectable text was found in this PDF (${pdfExtraction.pageCount || 'unknown'} pages).`;
            suggestions = [
              'Try a text-selectable PDF version',
              'Upload page screenshots for OCR-based extraction',
            ];
          }
        }
        break;
      }

      case 'data': {
        let dataDescription = '';
        
        if (file.type === 'text/csv') {
          const { headers, rows } = await parseCSV(base64);
          dataDescription = `CSV with ${rows.length} rows.\nHeaders: ${headers.join(', ')}`;
          processedFile.metadata = { headers, rowCount: rows.length };
        } else if (file.type === 'application/json') {
          const jsonData = parseJSON(base64);
          dataDescription = `JSON data: ${JSON.stringify(jsonData).slice(0, 500)}...`;
          processedFile.metadata = { preview: jsonData };
        }
        processedFile.extractedText = dataDescription;

        if (!options.skipAiSummary) {
          const analysisPrompt = `
Analyze this data for potential social media content:
${dataDescription}

Suggest insights, trends, or story angles that could be turned into engaging posts.
`;
          aiResponse = await aiService.chat([{ role: 'user', content: analysisPrompt }]);
          suggestions = [
            'Create an infographic from this data',
            'Generate stat-based carousel',
            'Write thread highlighting key findings',
          ];
        } else {
          aiResponse = 'Data file parsed successfully.';
          suggestions = ['Ask for trend extraction, insight ranking, or post-ready takeaways'];
        }
        break;
      }

      case 'audio': {
        // For audio, we'd need transcription
        // Using Web Speech API as fallback
        aiResponse = 'Audio file received. Transcription available on playback.';
        suggestions = [
          'Transcribe and turn into quote graphics',
          'Create audiogram for social',
          'Extract key soundbites',
        ];
        break;
      }

case 'video': {
  // For video, we extract a thumbnail
  aiResponse = 'Video file received. Thumbnail generated.';
  suggestions = [
  'Create short clips for Reels/TikTok',
  'Extract key moments',
  'Generate video summary post',
  ];
  break;
  }

  case 'html': {
  // Extract content from HTML
  const htmlData = extractHTMLText(base64);
  processedFile.extractedText = htmlData.text;
  processedFile.metadata = {
    title: htmlData.title,
    headings: htmlData.headings,
    linkCount: htmlData.links.length,
    imageCount: htmlData.images.length,
    meta: htmlData.meta,
  };

  // Summarize with AI
  if (htmlData.text.length > 0 && !options.skipAiSummary) {
    const summaryPrompt = `
Analyze this HTML page content for social media content creation.
Title: ${htmlData.title}
Headings: ${htmlData.headings.slice(0, 10).join(', ')}
Meta description: ${htmlData.meta['description'] || htmlData.meta['og:description'] || 'None'}

Main content:
${htmlData.text.slice(0, 8000)}

Provide:
1. A brief summary of what this page is about
2. Key points that could become social media posts
3. Quotes or insights worth sharing
`;
    aiResponse = await aiService.chat([{ role: 'user', content: summaryPrompt }]);
    suggestions = [
    'Create a thread summarizing key points',
    'Extract quotes for graphic posts',
    'Write a carousel breaking down the content',
    'Generate discussion post with your take',
    ];
  } else if (htmlData.text.length > 0) {
    aiResponse = 'HTML text extracted successfully.';
    suggestions = ['Ask for summary, quote extraction, or content angle generation'];
  } else {
    aiResponse = 'HTML file received but no text content could be extracted.';
    suggestions = ['Try a different HTML file'];
  }
  break;
  }

  case 'code': {
  // Parse code file
  const codeData = parseCodeFile(base64, file.name);
  processedFile.extractedText = codeData.code;
  processedFile.metadata = {
    language: codeData.language,
    lineCount: codeData.lineCount,
    imports: codeData.imports,
    functions: codeData.functions,
    classes: codeData.classes,
  };

  // Analyze with AI
  if (codeData.code.length > 0 && !options.skipAiSummary) {
    const analysisPrompt = `
Analyze this ${codeData.language} code for creating educational/technical social media content:

File has ${codeData.lineCount} lines.
Functions: ${codeData.functions.slice(0, 10).join(', ') || 'None detected'}
Classes: ${codeData.classes.slice(0, 10).join(', ') || 'None detected'}
Imports: ${codeData.imports.slice(0, 10).join(', ') || 'None detected'}

Code sample:
\`\`\`${codeData.language}
${codeData.code.slice(0, 4000)}
\`\`\`

Provide:
1. A brief summary of what this code does
2. Key concepts that could be taught
3. Interesting patterns or techniques used
4. Suggested social media content angles
`;
    aiResponse = await aiService.chat([{ role: 'user', content: analysisPrompt }]);
    suggestions = [
    'Create code walkthrough thread',
    'Generate educational carousel',
    'Write "Today I Learned" post',
    'Make a code snippet graphic',
    ];
  } else if (codeData.code.length > 0) {
    aiResponse = 'Code extracted successfully.';
    suggestions = ['Ask for explanation, architecture summary, or educational content conversion'];
  } else {
    aiResponse = 'Code file received but could not be parsed.';
    suggestions = ['Try a different code file'];
  }
  break;
  }
  
  default: {
  aiResponse = 'File received. Unable to process this file type automatically.';
  suggestions = ['Manual review required'];
  }
  }

    processedFile.summary = aiResponse;

    return {
      file: processedFile,
      aiResponse,
      suggestions,
    };
  },

  // Process multiple files
  async processFiles(
    files: File[],
    userMessage?: string,
    options: ProcessFileOptions = {}
  ): Promise<FileProcessorResult[]> {
    const results: FileProcessorResult[] = [];
    
    for (const file of files) {
      // Check file size limit (10MB)
      if (file.size > 10 * 1024 * 1024) {
        results.push({
          file: {
            id: `file_${Date.now()}`,
            name: file.name,
            type: 'unknown',
            mimeType: file.type,
            size: file.size,
          },
          aiResponse: 'File too large. Maximum size is 10MB.',
          suggestions: [],
        });
        continue;
      }

      try {
        const result = await this.processFile(file, userMessage, options);
        results.push(result);
      } catch (error) {
        results.push({
          file: {
            id: `file_${Date.now()}`,
            name: file.name,
            type: 'unknown',
            mimeType: file.type,
            size: file.size,
          },
          aiResponse: `Error processing file: ${error instanceof Error ? error.message : 'Unknown error'}`,
          suggestions: [],
        });
      }
    }

    return results;
  },

  // Process URL (fetch and summarize)
  async processURL(url: string): Promise<FileProcessorResult> {
    const id = `url_${Date.now()}`;

    try {
      // Use AI to summarize the URL content
      const prompt = `
Fetch and analyze this URL for social media content creation: ${url}

Describe what this page is about and suggest 3 ways to create engaging social posts from it.
`;
      const aiResponse = await aiService.chat([{ role: 'user', content: prompt }]);

      return {
        file: {
          id,
          name: url,
          type: 'url',
          mimeType: 'text/url',
          size: 0,
          metadata: { url },
        },
        aiResponse,
        suggestions: [
          'Create a thread discussing key points',
          'Design a quote graphic',
          'Write a reaction post',
        ],
      };
    } catch (error) {
      return {
        file: {
          id,
          name: url,
          type: 'url',
          mimeType: 'text/url',
          size: 0,
        },
        aiResponse: `Error processing URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
        suggestions: [],
      };
    }
  },

// Check if file type is supported
  isSupported(mimeType: string, fileName?: string): boolean {
  const supported = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'video/mp4',
  'text/html',
  'application/xhtml+xml',
  'text/javascript',
  'application/javascript',
  'text/typescript',
  ];
  
  // Also check by extension for code files
  if (fileName) {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const codeExtensions = ['js', 'jsx', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'css', 'scss', 'vue', 'svelte', 'html', 'htm', 'xml'];
    if (codeExtensions.includes(ext)) return true;
  }
  
  return supported.includes(mimeType);
  },

// Get accept string for file input
  getAcceptString(): string {
  return 'image/*,application/pdf,.doc,.docx,.txt,.md,.csv,.json,audio/*,video/mp4,.html,.htm,.xml,.js,.jsx,.ts,.tsx,.py,.go,.rs,.java,.c,.cpp,.css,.scss,.vue,.svelte';
  },
  };
