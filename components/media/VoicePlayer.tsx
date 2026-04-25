'use client';

import { useState, useRef, useEffect } from 'react';
import {
  isElevenLabsConfigured,
  previewSpeech,
  stopSpeech,
  synthesizeVoice,
} from '@/lib/services/voiceService';
import { GlassCard } from '@/components/nexus/GlassCard';

interface VoicePlayerProps {
  text: string;
  onGenerated?: (audioUrl: string) => void;
}

export default function VoicePlayer({ text, onGenerated }: VoicePlayerProps) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [provider, setProvider] = useState<'elevenlabs' | 'webspeech' | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const generateVoice = async () => {
    if (!text) return;

    setLoading(true);
    try {
      const hasElevenLabs = await isElevenLabsConfigured();
      if (!hasElevenLabs) {
        setProvider('webspeech');
        setAudioUrl(null);
        previewSpeech(text, { rate: speed });
        setPlaying(true);
        return;
      }

      const url = await synthesizeVoice(text);
      setAudioUrl(url);
      setProvider('elevenlabs');
      onGenerated?.(url);
    } catch (error) {
      console.error('[v0] Voice generation error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePlayPause = () => {
    if (provider === 'webspeech') {
      if (playing) {
        stopSpeech();
        setPlaying(false);
      } else {
        previewSpeech(text, { rate: speed });
        setPlaying(true);
      }
      return;
    }

    if (audioRef.current) {
      if (playing) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setPlaying(!playing);
    }
  };

  const handleSpeedChange = (newSpeed: number) => {
    setSpeed(newSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = newSpeed;
    }

    if (provider === 'webspeech' && playing) {
      stopSpeech();
      previewSpeech(text, { rate: newSpeed });
    }
  };

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  }, [speed]);

  useEffect(() => {
    return () => {
      stopSpeech();
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  return (
    <GlassCard className="p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Voice Synthesis</h3>

      {!audioUrl && provider !== 'webspeech' ? (
        <button
          onClick={generateVoice}
          disabled={loading || !text}
          className="w-full px-4 py-2 bg-violet/20 text-violet border border-violet/50 rounded-lg hover:bg-violet/30 disabled:opacity-50 transition-colors font-semibold"
        >
          {loading ? 'Generating Voice...' : 'Generate Voice'}
        </button>
      ) : (
        <div className="space-y-4">
          {audioUrl && (
            <audio
              ref={audioRef}
              src={audioUrl}
              onEnded={() => setPlaying(false)}
            />
          )}

          {provider === 'webspeech' && (
            <p className="text-sm text-gray-400">
              Browser speech is playing live. Download is only available when ElevenLabs is configured.
            </p>
          )}

          <div className="flex items-center gap-4">
            <button
              onClick={handlePlayPause}
              className="px-6 py-2 bg-violet/20 text-violet border border-violet/50 rounded-lg hover:bg-violet/30 transition-colors font-semibold"
            >
              {playing ? '⏸ Pause' : '▶ Play'}
            </button>

            <select
              value={speed}
              onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
              className="px-3 py-2 bg-bg-glass border border-border rounded-lg text-white text-sm"
            >
              <option value={0.8}>0.8x</option>
              <option value={1}>1x</option>
              <option value={1.2}>1.2x</option>
            </select>
          </div>

          {audioUrl && (
            <a
              href={audioUrl}
              download="voice.mp3"
              className="w-full px-4 py-2 bg-success/20 text-success border border-success/50 rounded-lg hover:bg-success/30 transition-colors text-center block font-semibold"
            >
              Download Audio
            </a>
          )}
        </div>
      )}
    </GlassCard>
  );
}
