export function normalizeIncomingMessage(content, hasFiles) {
  const normalized = (content || '').trim();
  if (normalized) return normalized;
  if (hasFiles) return 'Please analyze the attached files.';
  return '';
}

const CONTINUATION_CUE_PATTERN = /^\s*(continue|go on|proceed|carry on|keep going|do it|do that)\s*[.!?]*$/i;
const RETRY_REPLAY_CUE_PATTERN = /^\s*(try again|retry|run again|analyze again|re-run|redo that)\s*[.!?]*$/i;
const EXECUTION_VERB_PATTERN = /\b(generate|create|make|write|build|produce|render|schedule|queue|analy[sz]e|review|extract)\b/i;
const EXECUTION_TARGET_PATTERN = /\b(video|clip|reel|shorts?|image|photo|scene|script|post|content|caption|calendar|scheduler|pdf|file|document|brand)\b/i;
const VIDEO_REQUEST_PATTERN = /\b(video|clip|reel|short film|animation|shorts?)\b/i;
const IMAGE_REQUEST_PATTERN = /\b(image|photo|picture|poster|thumbnail|artwork|illustration)\b/i;

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
  return detectedIntent === 'make_video' || detectedIntent === 'create_image';
}

export function buildMediaGenerationFailureMessage(request, errorMessage = '') {
  const target = VIDEO_REQUEST_PATTERN.test(request || '') ? 'video' : IMAGE_REQUEST_PATTERN.test(request || '') ? 'image' : 'media';
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
    'Retry now, switch the media provider in Settings, or give me a tighter prompt and I will regenerate it directly.',
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
  const characterPattern = /\b(character|protagonist|hero|main character|major character|avatar|concept art)\b/;
  const characterIntroPattern = /\b(our (major|main)?\s*character is|main character is|major character is|protagonist is)\b/;
  const characterDetailPattern = /\b(wearing|holding|expression|hair|skin|robe|eyes|face|build|outfit|lantern|sword|barefoot|height|young|slim|twisted|frayed|pendant|serious|focused|traditional|torn|worn)\b/g;
  const questionLeadPattern = /^(how|what|why|when|where|which|can|could|should|would|is|are|do|does|did)\b/;
  const discussionPattern = /\b(idea|ideas|tips|how to|explain|difference|compare|improve|quality)\b/;

  const hasImageKeyword = imagePattern.test(lowerMessage);
  const hasVideoKeyword = videoPattern.test(lowerMessage);
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

  if ((hasImageKeyword || hasVideoKeyword) && (isQuestionLike || isDiscussion) && !hasMediaCreationVerb && !hasDirectRequest) {
    return 'answer_question';
  }

  if (hasImageKeyword && (hasMediaCreationVerb || hasDirectRequest || (!isQuestionLike && !isDiscussion && hasExecutionStyleContext))) {
    return 'create_image';
  }

  if (hasVideoKeyword && (hasMediaCreationVerb || hasDirectRequest || (!isQuestionLike && !isDiscussion && hasExecutionStyleContext))) {
    return 'make_video';
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
