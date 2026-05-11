import { exec } from 'child_process';
import { promisify } from 'util';


const execPromise = promisify(exec);

export interface TranscriptionResult {
  text: string;
  success?: boolean;
  duration?: number;
  confidence?: number;
}

/**
 * AudioTranscriptionService wraps the transcribe skill (Groq Whisper)
 * to convert audio files into text.
 */
export const audioTranscriptionService = {
  /**
   * Transcribes an audio file using the local transcribe script.
   * @param filePath Absolute path to the audio file (mp3, wav, m4a, etc.)
   */
  async transcribeFile(filePath: string): Promise<TranscriptionResult> {
    try {
      // Execute the transcribe script from the skill location
      // The script expects the file path as the first argument
      const { stdout, stderr } = await execPromise(`node /root/.pi/agent/skills/transcribe/transcribe.js "${filePath}"`);
      
      if (stderr && !stdout) {
        throw new Error(stderr);
      }

      return {
        text: stdout.trim(),
        success: true,
      };
    } catch (error) {
      console.error('[AudioTranscriptionService] Transcription failed:', error);
      throw new Error(`Audio transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  /**
   * Validates if a file format is supported by the transcribe skill.
   */
  isSupportedFormat(filePath: string): boolean {
    const supported = ['.m4a', '.mp3', '.wav', '.ogg', '.flac', '.webm'];
    return supported.some(ext => filePath.toLowerCase().endsWith(ext));
  }
};
