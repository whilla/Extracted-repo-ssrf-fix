'use client';

import { useState, useEffect, useRef } from 'react';
import { GlassCard } from '@/components/nexus/GlassCard';
import { NeonButton } from '@/components/nexus/NeonButton';
import type { MusicMood } from '@/lib/types';
import { analyzeMusicMood } from '@/lib/services/godModeService';
import { getBrowserMusicGenerator } from '@/lib/services/musicEngine';
import {
  Music,
  Play,
  Pause,
  SkipForward,
  Volume2,
  VolumeX,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';

interface Track {
  id: string;
  name: string;
  mood: string;
  duration: number;
  url?: string;
}

// Built-in mood-based tracks with browser-generated playback fallback
const MOOD_TRACKS: Record<string, Track[]> = {
  happy: [
    { id: 'h1', name: 'Sunny Days', mood: 'happy', duration: 120 },
    { id: 'h2', name: 'Feel Good', mood: 'happy', duration: 90 },
    { id: 'h3', name: 'Joy Ride', mood: 'happy', duration: 150 },
  ],
  energetic: [
    { id: 'e1', name: 'Power Up', mood: 'energetic', duration: 90 },
    { id: 'e2', name: 'Adrenaline', mood: 'energetic', duration: 60 },
    { id: 'e3', name: 'Unstoppable', mood: 'energetic', duration: 120 },
  ],
  calm: [
    { id: 'c1', name: 'Peaceful Mind', mood: 'calm', duration: 180 },
    { id: 'c2', name: 'Serenity', mood: 'calm', duration: 200 },
    { id: 'c3', name: 'Zen Garden', mood: 'calm', duration: 240 },
  ],
  inspiring: [
    { id: 'i1', name: 'Rise Up', mood: 'inspiring', duration: 150 },
    { id: 'i2', name: 'Dream Big', mood: 'inspiring', duration: 120 },
    { id: 'i3', name: 'New Horizons', mood: 'inspiring', duration: 180 },
  ],
  dramatic: [
    { id: 'd1', name: 'Epic Journey', mood: 'dramatic', duration: 120 },
    { id: 'd2', name: 'Tension Rising', mood: 'dramatic', duration: 90 },
    { id: 'd3', name: 'Cinematic', mood: 'dramatic', duration: 150 },
  ],
  mysterious: [
    { id: 'm1', name: 'Dark Forest', mood: 'mysterious', duration: 120 },
    { id: 'm2', name: 'Shadows', mood: 'mysterious', duration: 90 },
    { id: 'm3', name: 'The Unknown', mood: 'mysterious', duration: 150 },
  ],
  nostalgic: [
    { id: 'n1', name: 'Memories', mood: 'nostalgic', duration: 180 },
    { id: 'n2', name: 'Golden Days', mood: 'nostalgic', duration: 150 },
    { id: 'n3', name: 'Looking Back', mood: 'nostalgic', duration: 200 },
  ],
  sad: [
    { id: 's1', name: 'Melancholy', mood: 'sad', duration: 150 },
    { id: 's2', name: 'Rainy Day', mood: 'sad', duration: 120 },
    { id: 's3', name: 'Farewell', mood: 'sad', duration: 180 },
  ],
};

const MOODS = Object.keys(MOOD_TRACKS);

interface MusicPlayerProps {
  content?: string;
  contentType?: 'post' | 'reel' | 'story' | 'video';
  onClose?: () => void;
  onSelectTrack?: (track: Track) => void;
  compact?: boolean;
}

export function MusicPlayer({
  content,
  contentType = 'post',
  onClose,
  onSelectTrack,
  compact = false,
}: MusicPlayerProps) {
  const [selectedMood, setSelectedMood] = useState<string>('energetic');
  const [tracks, setTracks] = useState<Track[]>(MOOD_TRACKS.energetic);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const [isMuted, setIsMuted] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzedMood, setAnalyzedMood] = useState<MusicMood | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const browserMusicRef = useRef(getBrowserMusicGenerator());

  // Initialize audio element
  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.loop = true;
    audioRef.current.volume = volume;

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Update volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
    browserMusicRef.current.setVolume(isMuted ? 0 : volume);
  }, [volume, isMuted]);

  // Analyze content to suggest mood
  const analyzeContent = async () => {
    if (!content) return;
    
    setIsAnalyzing(true);
    try {
      const mood = await analyzeMusicMood(content, contentType, null);
      setAnalyzedMood(mood);
      setSelectedMood(mood.primary);
      setTracks(MOOD_TRACKS[mood.primary] || MOOD_TRACKS.energetic);
    } catch (error) {
      console.error('Failed to analyze content mood:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Change mood
  const handleMoodChange = (mood: string) => {
    setSelectedMood(mood);
    setTracks(MOOD_TRACKS[mood] || []);
    stopPlayback();
  };

  // Play/pause track
  const togglePlayback = (track: Track) => {
    if (currentTrack?.id === track.id && isPlaying) {
      stopPlayback();
    } else {
      playTrack(track);
    }
  };

  const playTrack = (track: Track) => {
    setCurrentTrack(track);
    setIsPlaying(true);
    if (track.url && audioRef.current) {
      browserMusicRef.current.stop();
      audioRef.current.src = track.url;
      audioRef.current.loop = true;
      audioRef.current.play().catch(error => {
        console.error('Failed to play audio track:', error);
        setIsPlaying(false);
      });
    } else {
      const fallbackMood: MusicMood = analyzedMood || {
        primary: (track.mood as MusicMood['primary']) || 'energetic',
        secondary: 'instrumental',
        tempo: ['calm', 'sad', 'nostalgic'].includes(track.mood) ? 'slow' : 'medium',
        energy: ['energetic', 'dramatic', 'happy', 'inspiring'].includes(track.mood) ? 75 : 45,
        genre: 'ambient electronic',
        instruments: ['synth', 'piano'],
        keywords: [track.mood, 'background'],
      };

      browserMusicRef.current.playAmbient(fallbackMood).catch(error => {
        console.error('Failed to start generated music:', error);
        setIsPlaying(false);
      });
    }

    if (onSelectTrack) {
      onSelectTrack(track);
    }
  };

  const stopPlayback = () => {
    setIsPlaying(false);
    browserMusicRef.current.stop();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

  const nextTrack = () => {
    if (!currentTrack) {
      playTrack(tracks[0]);
      return;
    }
    const currentIndex = tracks.findIndex(t => t.id === currentTrack.id);
    const nextIndex = (currentIndex + 1) % tracks.length;
    playTrack(tracks[nextIndex]);
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-lg bg-background/50 border border-border">
        <Music className="w-4 h-4 text-nexus-violet" />
        <select
          value={selectedMood}
          onChange={(e) => handleMoodChange(e.target.value)}
          className="flex-1 text-sm bg-transparent border-none outline-none text-foreground"
        >
          {MOODS.map(mood => (
            <option key={mood} value={mood}>{mood.charAt(0).toUpperCase() + mood.slice(1)}</option>
          ))}
        </select>
        {content && (
          <button
            onClick={analyzeContent}
            disabled={isAnalyzing}
            className="p-1 text-nexus-cyan hover:text-nexus-cyan/80"
            title="Auto-detect mood from content"
          >
            {isAnalyzing ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
          </button>
        )}
      </div>
    );
  }

  return (
    <GlassCard className="p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Music className="w-5 h-5 text-nexus-violet" />
          <h3 className="font-semibold text-foreground">Background Music</h3>
        </div>
        <div className="flex items-center gap-2">
          {content && (
            <NeonButton
              variant="ghost"
              size="sm"
              onClick={analyzeContent}
              disabled={isAnalyzing}
            >
              {isAnalyzing ? (
                <RefreshCw className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              {isAnalyzing ? 'Analyzing...' : 'Auto-Detect Mood'}
            </NeonButton>
          )}
          {onClose && (
            <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Analyzed Mood Info */}
      {analyzedMood && (
        <div className="mb-4 p-3 rounded-lg bg-nexus-violet/10 border border-nexus-violet/20">
          <p className="text-sm text-foreground">
            <span className="font-medium">Detected Mood:</span> {analyzedMood.primary}
            {analyzedMood.secondary && ` with ${analyzedMood.secondary} undertones`}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Suggested genre: {analyzedMood.genre} | Tempo: {analyzedMood.tempo} | Energy: {analyzedMood.energy}%
          </p>
        </div>
      )}

      {/* Mood Selector */}
      <div className="flex flex-wrap gap-2 mb-4">
        {MOODS.map(mood => (
          <button
            key={mood}
            onClick={() => handleMoodChange(mood)}
            className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
              selectedMood === mood
                ? 'bg-nexus-violet text-background'
                : 'bg-background/50 text-muted-foreground hover:text-foreground'
            }`}
          >
            {mood.charAt(0).toUpperCase() + mood.slice(1)}
          </button>
        ))}
      </div>

      {/* Track List */}
      <div className="space-y-2 mb-4">
        {tracks.map(track => (
          <div
            key={track.id}
            className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
              currentTrack?.id === track.id
                ? 'bg-nexus-violet/20 border border-nexus-violet/30'
                : 'bg-background/30 hover:bg-background/50'
            }`}
          >
            <div className="flex items-center gap-3">
              <button
                onClick={() => togglePlayback(track)}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                  currentTrack?.id === track.id && isPlaying
                    ? 'bg-nexus-violet text-background'
                    : 'bg-background/50 text-muted-foreground hover:text-foreground'
                }`}
              >
                {currentTrack?.id === track.id && isPlaying ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4 ml-0.5" />
                )}
              </button>
              <div>
                <p className="font-medium text-foreground">{track.name}</p>
                <p className="text-xs text-muted-foreground">
                  {Math.floor(track.duration / 60)}:{(track.duration % 60).toString().padStart(2, '0')}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                playTrack(track);
                onSelectTrack?.(track);
              }}
              className="text-xs text-nexus-cyan hover:underline"
            >
              Use This
            </button>
          </div>
        ))}
      </div>

      {/* Playback Controls */}
      <div className="flex items-center justify-between pt-4 border-t border-border">
        <div className="flex items-center gap-2">
          <button
            onClick={() => currentTrack && togglePlayback(currentTrack)}
            className="w-10 h-10 rounded-full bg-nexus-violet/20 flex items-center justify-center text-nexus-violet hover:bg-nexus-violet/30"
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
          </button>
          <button
            onClick={nextTrack}
            className="w-8 h-8 rounded-full bg-background/50 flex items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        {/* Volume Control */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="text-muted-foreground hover:text-foreground"
          >
            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-20 h-1 rounded-full appearance-none bg-background/50 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-nexus-violet"
          />
        </div>

        {/* Current Track Info */}
        {currentTrack && (
          <div className="text-sm text-muted-foreground">
            Now: <span className="text-foreground">{currentTrack.name}</span>
          </div>
        )}
      </div>
    </GlassCard>
  );
}
