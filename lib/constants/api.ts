/**
 * Centralized API URL Constants
 * All external API URLs should be imported from this file.
 * URLs use NEXT_PUBLIC_ env vars with sensible defaults.
 */

// AI Provider URLs
export const GROQ_URL = process.env.NEXT_PUBLIC_GROQ_URL || 'https://api.groq.com'
export const OPENROUTER_URL = process.env.NEXT_PUBLIC_OPENROUTER_URL || 'https://openrouter.ai'
export const NVIDIA_URL = process.env.NEXT_PUBLIC_NVIDIA_URL || 'https://integrate.api.nvidia.com'
export const TOGETHER_URL = process.env.NEXT_PUBLIC_TOGETHER_URL || 'https://api.together.xyz'
export const FIREWORKS_URL = process.env.NEXT_PUBLIC_FIREWORKS_URL || 'https://api.fireworks.ai'
export const DEEPSEEK_URL = process.env.NEXT_PUBLIC_DEEPSEEK_URL || 'https://api.deepseek.com'
export const OLLAMA_URL = process.env.NEXT_PUBLIC_OLLAMA_URL || 'http://localhost:11434'
export const GITHUB_MODELS_URL = process.env.NEXT_PUBLIC_GITHUB_MODELS_URL || 'https://models.github.ai'
export const BYTEZ_URL = process.env.NEXT_PUBLIC_BYTEZ_URL || 'https://api.bytez.com'
export const POE_URL = process.env.NEXT_PUBLIC_POE_URL || 'https://api.poe.com'

// Image Generation URLs
export const STABILITY_URL = process.env.NEXT_PUBLIC_STABILITY_URL || 'https://api.stability.ai'
export const LEONARDO_URL = process.env.NEXT_PUBLIC_LEONARDO_URL || 'https://api.leonardo.ai'
export const IDEOGRAM_URL = process.env.NEXT_PUBLIC_IDEOGRAM_URL || 'https://api.ideogram.ai'

// Voice/Audio URLs
export const ELEVENLABS_URL = process.env.NEXT_PUBLIC_ELEVENLABS_URL || 'https://api.elevenlabs.io'
export const SPEECHIFY_URL = process.env.NEXT_PUBLIC_SPEECHIFY_URL || 'https://api.speechify.com'
export const PLAYHT_URL = process.env.NEXT_PUBLIC_PLAYHT_URL || 'https://api.play.ht'
export const RESEMBLE_URL = process.env.NEXT_PUBLIC_RESEMBLE_URL || 'https://api.resemble.ai'

// Music Generation URLs
export const SUNO_URL = process.env.NEXT_PUBLIC_SUNO_URL || 'https://api.suno.ai'
export const UDIO_URL = process.env.NEXT_PUBLIC_UDIO_URL || 'https://api.udio.ai'
export const BEATOVEN_URL = process.env.NEXT_PUBLIC_BEATOVEN_URL || 'https://api.beatoven.ai'
export const SOUNDRAW_URL = process.env.NEXT_PUBLIC_SOUNDRAW_URL || 'https://api.soundraw.io'

// Publishing URLs
export const AYRSHARE_URL = process.env.NEXT_PUBLIC_AYRSHARE_URL || 'https://app.ayrshare.com/api'