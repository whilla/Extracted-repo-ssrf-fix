import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeIncomingMessage,
  detectExplicitMediaIntent,
  buildFallbackChatMessages,
  isContinuationOrRetryCue,
  findContinuationExecutionRequest,
  isFileAnalysisFailure,
  isMediaGenerationRequest,
  buildMediaGenerationFailureMessage,
  buildFileAnalysisEmptyResponseMessage,
  buildFileAnalysisFailureMessage,
  getConversationalExecutionTask,
} from '../lib/context/agentBehavior.mjs';

test('normalizeIncomingMessage handles blank content with files', () => {
  assert.equal(normalizeIncomingMessage('   ', true), 'Please analyze the attached files.');
});

test('normalizeIncomingMessage keeps non-empty content', () => {
  assert.equal(normalizeIncomingMessage('  make a reel ', false), 'make a reel');
});

test('detectExplicitMediaIntent routes question about video to answer mode', () => {
  assert.equal(detectExplicitMediaIntent('How can I improve my video quality?'), 'answer_question');
});

test('detectExplicitMediaIntent routes explicit video generation', () => {
  assert.equal(detectExplicitMediaIntent('Generate a cinematic video of city streets at night'), 'make_video');
});

test('detectExplicitMediaIntent routes short video clip requests to make_video', () => {
  assert.equal(detectExplicitMediaIntent('Generate a short video clip for the brand'), 'make_video');
});

test('detectExplicitMediaIntent routes execution-style video briefs without explicit create verbs', () => {
  assert.equal(detectExplicitMediaIntent('cinematic vertical video for a horror channel intro'), 'make_video');
});

test('detectExplicitMediaIntent routes direct request phrasing for image generation', () => {
  assert.equal(detectExplicitMediaIntent('I want an image of a luxury watch on black velvet'), 'create_image');
});

test('detectExplicitMediaIntent routes execution-style image briefs without explicit create verbs', () => {
  assert.equal(detectExplicitMediaIntent('studio product photo for a luxury perfume launch'), 'create_image');
});

test('detectExplicitMediaIntent keeps media quality discussion as answer mode', () => {
  assert.equal(detectExplicitMediaIntent('video quality tips for better lighting'), 'answer_question');
});

test('detectExplicitMediaIntent routes explicit image generation', () => {
  assert.equal(detectExplicitMediaIntent('Create an image of a luxury product hero shot'), 'create_image');
});

test('buildFallbackChatMessages includes request and error context', () => {
  const messages = buildFallbackChatMessages('make a video ad', 'Provider timeout');
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, 'system');
  assert.equal(messages[1].role, 'user');
  assert.match(messages[1].content, /make a video ad/);
  assert.match(messages[1].content, /Provider timeout/);
});

test('isContinuationOrRetryCue detects continuation and retry phrases', () => {
  assert.equal(isContinuationOrRetryCue('continue'), true);
  assert.equal(isContinuationOrRetryCue('Try again'), true);
  assert.equal(isContinuationOrRetryCue('run again!'), true);
  assert.equal(isContinuationOrRetryCue('make a new image'), false);
});

test('findContinuationExecutionRequest returns latest executable user request and preserves attachments', () => {
  const attachment = {
    name: 'brief.pdf',
    mimeType: 'application/pdf',
    data: 'ZmFrZQ==',
    size: 1024,
  };

  const result = findContinuationExecutionRequest([
    { role: 'assistant', content: 'How can I help?' },
    { role: 'user', content: 'continue' },
    { role: 'user', content: 'analyze this pdf and extract summary', attachments: [attachment] },
    { role: 'user', content: 'retry' },
  ]);

  assert.deepEqual(result, {
    text: 'analyze this pdf and extract summary',
    attachments: [attachment],
  });
});

test('findContinuationExecutionRequest returns null when no executable request exists', () => {
  const result = findContinuationExecutionRequest([
    { role: 'user', content: 'continue' },
    { role: 'user', content: 'retry' },
    { role: 'assistant', content: 'Need more detail.' },
  ]);

  assert.equal(result, null);
});

test('isFileAnalysisFailure detects explicit file-analysis failures', () => {
  assert.equal(isFileAnalysisFailure('analyze this PDF', ''), true);
  assert.equal(isFileAnalysisFailure('help me with this brand plan', 'read_file model timeout'), true);
  assert.equal(isFileAnalysisFailure('make an image ad', 'provider timeout'), false);
});

test('isMediaGenerationRequest detects explicit video and image generation requests', () => {
  assert.equal(isMediaGenerationRequest('make a cinematic video ad for my launch'), true);
  assert.equal(isMediaGenerationRequest('studio product photo for a luxury perfume launch'), true);
  assert.equal(isMediaGenerationRequest('how do i improve my video quality?'), false);
});

test('buildMediaGenerationFailureMessage keeps media failures out of generic advice mode', () => {
  const message = buildMediaGenerationFailureMessage(
    'make a cinematic video ad for my launch',
    'LTX video error (402): insufficient balance'
  );

  assert.match(message, /video generation path/);
  assert.match(message, /insufficient balance/);
  assert.match(message, /I did not switch this into generic advice mode/);
});

test('buildFileAnalysisEmptyResponseMessage includes extracted context when available', () => {
  const message = buildFileAnalysisEmptyResponseMessage('Page 1: Exact extracted facts');
  assert.match(message, /I could not get a complete model response/);
  assert.match(message, /Page 1: Exact extracted facts/);
  assert.match(message, /analyze this deeper/);
});

test('buildFileAnalysisEmptyResponseMessage returns retry guidance when no extraction exists', () => {
  assert.equal(
    buildFileAnalysisEmptyResponseMessage(''),
    'I received the file, but the analysis model returned no content. Please retry now, or switch to a vision-capable model/provider if this PDF is scanned.'
  );
});

test('buildFileAnalysisFailureMessage includes extracted context when provider call fails', () => {
  const message = buildFileAnalysisFailureMessage('Page 2: Table values');
  assert.match(message, /I could not get a full model response/);
  assert.match(message, /Page 2: Table values/);
  assert.match(message, /retry analysis with a different model now/);
});

test('buildFileAnalysisFailureMessage returns retry guidance when no extraction exists', () => {
  assert.equal(
    buildFileAnalysisFailureMessage(''),
    'I received the file but the analysis model failed before returning content. Retry now, or switch to a vision-capable model/provider if this PDF is scanned.'
  );
});

test('getConversationalExecutionTask routes questions and file work through analysis', () => {
  assert.equal(getConversationalExecutionTask('answer_question'), 'analysis');
  assert.equal(getConversationalExecutionTask('manage_brand'), 'analysis');
  assert.equal(getConversationalExecutionTask('read_file'), 'analysis');
  assert.equal(getConversationalExecutionTask('generate_content'), 'chat');
});
