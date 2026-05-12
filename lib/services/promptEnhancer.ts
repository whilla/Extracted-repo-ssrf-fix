/**
 * Prompt Enhancer - Adds anti-robotic and naturalness guidance to media generation prompts.
 * Ensures all generated content (images, music, voice, video) sounds and looks human-made.
 */

export function enhanceImagePrompt(prompt: string): string {
  return `${prompt}, natural photography, real human subject, authentic expression, natural lighting, candid moment, realistic textures, genuine emotion, real-world setting, not AI-generated, not digital art, not rendered, not synthetic looking, human-captured quality`;
}

export function enhanceMusicPrompt(prompt: string): string {
  return `${prompt}, organic instrumentation, human performance, natural dynamics, authentic feel, real musicians, live recording quality, emotional expression, not robotic, not synthetic, not MIDI-sounding, human tempo variations, genuine musicality`;
}

export function enhanceVoicePrompt(prompt: string): string {
  return `${prompt} (speak this text naturally with human emotion, authentic pacing, conversational tone, natural pauses, genuine feeling, like a real person speaking, not a robotic TTS)`;
}

export function enhanceVideoPrompt(prompt: string): string {
  return `${prompt}, natural motion, real human movement, authentic scene, organic transitions, real-world physics, genuine interaction, not CGI, not computer-generated, not animated, real camera footage quality, natural lighting, handheld realism`;
}
