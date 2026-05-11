// Voice Conversation Service - Live audio conversation with AI
// Uses Web Speech API for speech recognition and synthesis

export interface VoiceConversationState {
  isListening: boolean;
  isSpeaking: boolean;
  transcript: string;
  error: string | null;
}

type VoiceCallback = (text: string) => void;
type StateCallback = (state: Partial<VoiceConversationState>) => void;
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
};

class VoiceConversationService {
  private recognition: SpeechRecognitionLike | null = null;
  private synthesis: SpeechSynthesis | null = null;
  private isInitialized = false;
  private onTranscript: VoiceCallback | null = null;
  private onStateChange: StateCallback | null = null;
  private selectedVoice: SpeechSynthesisVoice | null = null;
  private isContinuousMode = false;
  
  constructor() {
    if (typeof window !== 'undefined') {
      this.synthesis = window.speechSynthesis;
    }
  }
  
  // Initialize speech recognition
  async initialize(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    
    // Check for browser support
    const SpeechRecognitionAPI = (window as any).SpeechRecognition ||
                                 (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognitionAPI) {
      console.warn('Speech recognition not supported');
      return false;
    }
    
    // Request microphone permission
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      console.error('Microphone permission denied:', error);
      return false;
    }
    
    this.recognition = new SpeechRecognitionAPI();
    const recognition = this.recognition as SpeechRecognitionLike;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    
    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      
      if (finalTranscript && this.onTranscript) {
        this.onTranscript(finalTranscript.trim());
      }
      
      this.onStateChange?.({ transcript: interimTranscript || finalTranscript });
    };
    
    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      this.onStateChange?.({ error: event.error, isListening: false });
    };
    
    recognition.onend = () => {
      this.onStateChange?.({ isListening: false });
      // Auto-restart in continuous mode
      if (this.isContinuousMode && this.recognition) {
        try {
          this.recognition.start();
          this.onStateChange?.({ isListening: true });
        } catch {
          // Already started
        }
      }
    };
    
    // Load available voices
    this.loadVoices();
    
    this.isInitialized = true;
    return true;
  }
  
  // Load available voices
  private loadVoices(): void {
    if (!this.synthesis) return;
    
    const loadVoiceList = () => {
      const voices = this.synthesis?.getVoices() || [];
      if (voices.length === 0) return;
      
      // Prefer a natural English voice
      this.selectedVoice = voices.find(v => 
        v.lang.startsWith('en') && v.name.includes('Natural')
      ) || voices.find(v => 
        v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Microsoft'))
      ) || voices.find(v => 
        v.lang.startsWith('en')
      ) || voices[0] || null;
    };
    
    loadVoiceList();
    this.synthesis.onvoiceschanged = loadVoiceList;
  }
  
  // Set callbacks
  setCallbacks(onTranscript: VoiceCallback, onStateChange: StateCallback): void {
    this.onTranscript = onTranscript;
    this.onStateChange = onStateChange;
  }
  
  // Start listening
  async startListening(continuous = false): Promise<boolean> {
    if (!this.isInitialized) {
      const initialized = await this.initialize();
      if (!initialized) return false;
    }
    
    const recognition = this.recognition;
    if (!recognition) return false;
    
    this.isContinuousMode = continuous;
    
    try {
      recognition.start();
      this.onStateChange?.({ isListening: true, error: null });
      return true;
    } catch (error) {
      console.error('Failed to start listening:', error);
      return false;
    }
  }
  
  // Stop listening
  stopListening(): void {
    this.isContinuousMode = false;
    this.recognition?.stop();
    this.onStateChange?.({ isListening: false });
  }
  
  // Speak text
  async speak(text: string, options: { rate?: number; pitch?: number; volume?: number } = {}): Promise<void> {
    if (!this.synthesis) return;
    
    // Stop any ongoing speech
    this.synthesis.cancel();
    
    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      
      if (this.selectedVoice) {
        utterance.voice = this.selectedVoice;
      }
      
      utterance.rate = options.rate ?? 1;
      utterance.pitch = options.pitch ?? 1;
      utterance.volume = options.volume ?? 1;
      
      utterance.onstart = () => {
        this.onStateChange?.({ isSpeaking: true });
      };
      
      utterance.onend = () => {
        this.onStateChange?.({ isSpeaking: false });
        resolve();
      };
      
      utterance.onerror = () => {
        this.onStateChange?.({ isSpeaking: false });
        resolve();
      };
      
      if (this.synthesis) {
        this.synthesis.speak(utterance);
      } else {
        reject(new Error('Speech synthesis not available'));
      }
    });
  }
  
  // Stop speaking
  stopSpeaking(): void {
    this.synthesis?.cancel();
    this.onStateChange?.({ isSpeaking: false });
  }
  
  // Get available voices
  getVoices(): SpeechSynthesisVoice[] {
    return this.synthesis?.getVoices() || [];
  }
  
  // Set voice
  setVoice(voice: SpeechSynthesisVoice): void {
    this.selectedVoice = voice;
  }
  
  // Check if supported
  isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    
    const hasSpeechRecognition = !!(
      (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition || 
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
    );
    const hasSpeechSynthesis = !!window.speechSynthesis;
    
    return hasSpeechRecognition && hasSpeechSynthesis;
  }
}

// Singleton instance
export const voiceConversation = new VoiceConversationService();

// Download utility for agent content
export function downloadContent(
  content: string,
  filename: string,
  type: 'text' | 'json' | 'markdown' | 'image' = 'text'
): void {
  let blob: Blob;
  let extension: string;
  
  switch (type) {
    case 'json':
      blob = new Blob([content], { type: 'application/json' });
      extension = '.json';
      break;
    case 'markdown':
      blob = new Blob([content], { type: 'text/markdown' });
      extension = '.md';
      break;
    case 'image':
      // For base64 images
      const base64 = content.split(',')[1] || content;
      const binary = atob(base64);
      const array = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        array[i] = binary.charCodeAt(i);
      }
      blob = new Blob([array], { type: 'image/png' });
      extension = '.png';
      break;
    default:
      blob = new Blob([content], { type: 'text/plain' });
      extension = '.txt';
  }
  
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith(extension) ? filename : filename + extension;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Download image from URL
export async function downloadImageFromUrl(url: string, filename: string): Promise<void> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    console.error('Failed to download image:', error);
    // Fallback: open in new tab
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
