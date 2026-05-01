export function normalizeIncomingMessage(content, hasFiles) {
  const normalized = (content || '').trim();
  if (normalized) return normalized;
  if (hasFiles) return 'Please analyze the attached files.';
  return '';
}

const CONTINUATION_CUE_PATTERN = /^\s*(continue|go on|proceed|carry on|keep going|do it|do that)\s*[.!?]*$/i;
const RETRY_REPLAY_CUE_PATTERN = /^\s*(try again|retry|run again|analyze again|re-run|redo that|(?:try|retry|run|redo|generate|create|make)(?:[\s\S]{0,40})\bagain)\s*[.!?]*$/i;
const EXECUTION_VERB_PATTERN = /\b(generate|create|make|write|build|produce|render|schedule|queue|analy[sz]e|review|extract)\b/i;
const EXECUTION_TARGET_PATTERN = /\b(video|clip|reel|shorts?|image|photo|audio|voiceover|voice over|narration|speech|tts|music|soundtrack|score|sound design|scene|script|post|content|caption|calendar|scheduler|pdf|file|document|brand)\b/i;
const VIDEO_REQUEST_PATTERN = /\b(video|clip|reel|short film|animation|shorts?)\b/i;
const IMAGE_REQUEST_PATTERN = /\b(image|photo|picture|poster|thumbnail|artwork|illustration)\b/i;
const AUDIO_REQUEST_PATTERN = /\b(audio|audio story|voiceover|voice over|narration|spoken story|speech|tts|elevenlabs)\b/i;
const MUSIC_REQUEST_PATTERN = /\b(music|background music|soundtrack|score|theme music|suno|mubert)\b/i;
const BRAINSTORM_REQUEST_PATTERN = /\b(brainstorm|ideate|suggest|give me|generate|come up with|need|want)\b[\s\S]{0,80}\b(ideas?|content ideas?|post ideas?|angles?|hooks?)\b|\b(content ideas?|post ideas?|ideas?)\b[\s\S]{0,60}\b(for|about|around|today|this week)\b/i;

export function isBrainstormingRequest(message) {
  if (!message || typeof message !== 'string') return false;
  const normalized = message.trim().toLowerCase();
  if (!normalized) return false;
  if (/\b(my|the)\s+(content\s+)?idea\s*(is|=|:)\b/i.test(normalized)) return false;
  return BRAINSTORM_REQUEST_PATTERN.test(normalized);
}

export function extractBrainstormTopic(message) {
  if (!message || typeof message !== 'string') return 'content I can post today';

  const cleaned = message
    .replace(/\b(please|can you|could you|i need|i want|give me|generate|brainstorm|ideate|suggest|come up with)\b/gi, ' ')
    .replace(/\b\d+\b/g, ' ')
    .replace(/\b(content ideas?|post ideas?|ideas?|angles?|hooks?)\b/gi, ' ')
    .replace(/\b(for|about|around|today|this week|to post|i can post)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned.length >= 4 ? cleaned : 'content I can post today';
}

export function isContinuationCue(message) {
  return CONTINUATION_CUE_PATTERN.test((message || '').trim());
}

export function isRetryReplayCue(message) {
  return RETRY_REPLAY_CUE_PATTERN.test((message || '').trim());
}

export function isContinuationOrRetryCue(message) {
  return isContinuationCue(message) || isRetryReplayCue(message);
}

export function findContinuationExecutionRequest(messages = []) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== 'user') continue;

    const text = typeof message.content === 'string' ? message.content.trim() : '';
    if (!text || isContinuationOrRetryCue(text)) continue;

    if (EXECUTION_VERB_PATTERN.test(text) && EXECUTION_TARGET_PATTERN.test(text)) {
      return {
        text,
        attachments: Array.isArray(message.attachments) ? message.attachments : undefined,
      };
    }
  }

  return null;
}

export function isFileAnalysisFailure(request, errorMessage = '') {
  return (
    /\b(pdf|file|document|attached files?|analy[sz]e)\b/i.test(request || '') ||
    /\b(read_file)\b/i.test(errorMessage || '')
  );
}

export function isMediaGenerationRequest(request) {
  if (!request || typeof request !== 'string') return false;
  const detectedIntent = detectExplicitMediaIntent(request);
  return detectedIntent === 'make_video' || detectedIntent === 'create_image' || detectedIntent === 'make_audio' || detectedIntent === 'make_music';
}

export function shouldAvoidPuterForIntent(intentType, request = '') {
  if (intentType === 'create_image' || intentType === 'make_video' || intentType === 'make_audio' || intentType === 'make_music' || intentType === 'regenerate_media') {
    return true;
  }

  return isMediaGenerationRequest(request);
}

function buildMediaFailureRecoveryLine(errorMessage, target) {
  const normalizedError = (errorMessage || '').toLowerCase();

  if (
    normalizedError.includes('elevenlabs') &&
    normalizedError.includes('missing_permissions') &&
    normalizedError.includes('text_to_speech')
  ) {
    return 'Enable the `text_to_speech` permission on the ElevenLabs API key in Settings, save it again, then retry the audio generation.';
  }

  if (normalizedError.includes('elevenlabs') && normalizedError.includes('api key not configured')) {
    return 'Add an ElevenLabs API key in Settings, save it, then retry the audio generation.';
  }

  if (normalizedError.includes('quota') || normalizedError.includes('payment_required') || normalizedError.includes('insufficient credits')) {
    return 'Check the provider credits or quota in Settings, then retry after the provider account can generate media again.';
  }

  return `Retry now, switch the media provider in Settings, or give me a tighter prompt and I will regenerate the ${target} directly.`;
}

export function buildMediaGenerationFailureMessage(request, errorMessage = '') {
  const target = VIDEO_REQUEST_PATTERN.test(request || '')
    ? 'video'
    : IMAGE_REQUEST_PATTERN.test(request || '')
    ? 'image'
    : AUDIO_REQUEST_PATTERN.test(request || '')
    ? 'audio'
    : MUSIC_REQUEST_PATTERN.test(request || '')
    ? 'music'
    : 'media';
  const trimmedError = (errorMessage || '').trim();

  return [
    `I kept this on the ${target} generation path, but the provider failed before returning a usable ${target} asset.`,
    '',
    `Request: ${request}`,
    '',
    'What happened:',
    `- The ${target} generator did not return a finished asset`,
    trimmedError ? `- Provider error: ${trimmedError}` : '- Provider error: no provider detail was returned',
    '- I did not switch this into generic advice mode',
    '',
    buildMediaFailureRecoveryLine(trimmedError, target),
  ].join('\n');
}

export function buildFileAnalysisEmptyResponseMessage(extractedFileContext = '') {
  const trimmedContext = (extractedFileContext || '').trim();
  if (trimmedContext) {
    return [
      'I could not get a complete model response, but I did extract content from your file:',
      '',
      trimmedContext,
      '',
      'If you want deeper analysis, say "analyze this deeper" and I will retry with another model.',
    ].join('\n');
  }

  return 'I received the file, but the analysis model returned no content. Please retry now, or switch to a vision-capable model/provider if this PDF is scanned.';
}

export function buildFileAnalysisFailureMessage(extractedFileContext = '') {
  const trimmedContext = (extractedFileContext || '').trim();
  if (trimmedContext) {
    return [
      'I could not get a full model response, but I extracted what I can from the attached file:',
      '',
      trimmedContext,
      '',
      'If you want, I can retry analysis with a different model now.',
    ].join('\n');
  }

  return 'I received the file but the analysis model failed before returning content. Retry now, or switch to a vision-capable model/provider if this PDF is scanned.';
}

export function getConversationalExecutionTask(intentType) {
  if (intentType === 'read_file' || intentType === 'manage_brand' || intentType === 'answer_question') {
    return 'analysis';
  }

  return 'chat';
}

export function detectExplicitMediaIntent(message) {
  if (!message || typeof message !== 'string') return null;
  
  const lowerMessage = message.toLowerCase();
  const mediaCreationVerbPattern = /\b(create|generate|make|produce|render|design|draw|animate|shoot|film|craft)\b/;
  const directRequestPattern = /\b(i want|i need|give me|show me|please make|can you make|can you create|create for me)\b/;
  const correctionPattern = /\b(fix this|fix thiz|redo|regenerate|try again)\b/;
  const imagePattern = /\b(image|photo|picture|poster|thumbnail|artwork|illustration)\b/;
  const videoPattern = /\b(video|reel|clip|animation|cinematic|short film)\b/;
  const audioPattern = /\b(audio|audio story|voiceover|voice over|narration|spoken story|speech|tts|elevenlabs)\b/;
  const musicPattern = /\b(music|background music|soundtrack|score|theme music|suno|mubert)\b/;
  const characterPattern = /\b(character|protagonist|hero|main character|major character|avatar|concept art)\b/;
  const characterIntroPattern = /\b(our (major|main)?\s*character is|main character is|major character is|protagonist is)\b/;
  const characterDetailPattern = /\b(wearing|holding|expression|hair|skin|robe|eyes|face|build|outfit|lantern|sword|barefoot|height|young|slim|twisted|frayed|pendant|serious|focused|traditional|torn|worn)\b/g;
  const questionLeadPattern = /^(how|what|why|when|where|which|can|could|should|would|is|are|do|does|did)\b/;
  const discussionPattern = /\b(idea|ideas|tips|how to|explain|difference|compare|improve|quality)\b/;

  const hasImageKeyword = imagePattern.test(lowerMessage);
  const hasVideoKeyword = videoPattern.test(lowerMessage);
  const hasAudioKeyword = audioPattern.test(lowerMessage);
  const hasMusicKeyword = musicPattern.test(lowerMessage);
  const hasCharacterKeyword = characterPattern.test(lowerMessage);
  const hasCharacterIntro = characterIntroPattern.test(lowerMessage);
  const characterDetails = lowerMessage.match(characterDetailPattern) || [];
  const hasCharacterDetails = characterDetails.length > 0;
  const hasRichCharacterDescription = characterDetails.length >= 4;
  const hasMediaCreationVerb = mediaCreationVerbPattern.test(lowerMessage);
  const hasDirectRequest = directRequestPattern.test(lowerMessage);
  const hasCorrectionRequest = correctionPattern.test(lowerMessage);
  const isQuestionLike = questionLeadPattern.test(lowerMessage);
  const isDiscussion = discussionPattern.test(lowerMessage);
  const isLongDescription = lowerMessage.length > 160;
  const hasExecutionStyleContext = /\b(for|with|showing|featuring|about|of|in|shot|scene|ad|promo|trailer|hook|9:16|16:9|vertical|cinematic|photorealistic|realistic|studio)\b/.test(lowerMessage);

  if ((hasImageKeyword || hasVideoKeyword || hasAudioKeyword || hasMusicKeyword) && (isQuestionLike || isDiscussion) && !hasMediaCreationVerb && !hasDirectRequest) {
    return 'answer_question';
  }

  if (hasImageKeyword && (hasMediaCreationVerb || hasDirectRequest || (!isQuestionLike && !isDiscussion && hasExecutionStyleContext))) {
    return 'create_image';
  }

  if (hasVideoKeyword && (hasMediaCreationVerb || hasDirectRequest || (!isQuestionLike && !isDiscussion && hasExecutionStyleContext))) {
    return 'make_video';
  }

  if (hasAudioKeyword && (hasMediaCreationVerb || hasDirectRequest || /\b(use|elevenlabs|listen|send me|output)\b/.test(lowerMessage))) {
    return 'make_audio';
  }

  if (hasMusicKeyword && (hasMediaCreationVerb || hasDirectRequest || /\b(use|suno|mubert|listen|send me|output)\b/.test(lowerMessage))) {
    return 'make_music';
  }

  if (
    (hasCharacterIntro || hasCharacterKeyword) &&
    (hasCharacterDetails || hasRichCharacterDescription) &&
    (isLongDescription || hasRichCharacterDescription) &&
    !isQuestionLike
  ) {
    return 'create_image';
  }

  if (
    hasCorrectionRequest &&
    (hasCharacterIntro || hasCharacterKeyword || hasRichCharacterDescription) &&
    !isQuestionLike
  ) {
    return 'create_image';
  }

  return null;
}

export function isExplicitExecutionRequest(message) {
  if (!message || typeof message !== 'string') return false;
  const lowerMessage = message.toLowerCase();
  const executionVerbPattern = /\b(create|generate|make|write|build|draft|produce|turn this into|convert this into)\b/;
  const outputPattern = /\b(post|caption|thread|script|carousel|reel|video|image|prompt|ad copy|email|plan|calendar|content)\b/;
  const strictRequestPattern = /\b(please|i want|i need|do this|give me|start now|go ahead)\b/;

  return (executionVerbPattern.test(lowerMessage) && outputPattern.test(lowerMessage)) || strictRequestPattern.test(lowerMessage) && outputPattern.test(lowerMessage);
}

export function buildFallbackChatMessages(request, errorMessage) {
  if (!request || typeof request !== 'string') {
    return [
      {
        role: 'system',
        content: 'You are Nexus Agent. A tool request failed. Provide a helpful response.',
      },
      {
        role: 'user',
        content: `Tool error: ${String(errorMessage)}. Please help.`,
      },
    ];
  }

  return [
    {
      role: 'system',
      content: 'You are Nexus Agent. A tool request failed, but you must still be useful. Give a concise, direct response that helps the user move forward immediately.',
    },
    {
      role: 'user',
      content: `Request: ${request}\n\nTool error: ${String(errorMessage)}\n\nProvide the best actionable response now.`,
    },
  ];
}
