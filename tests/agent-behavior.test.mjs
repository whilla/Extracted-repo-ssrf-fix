import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeIncomingMessage,
  detectExplicitMediaIntent,
  buildFallbackChatMessages,
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

test('detectExplicitMediaIntent routes direct request phrasing for image generation', () => {
  assert.equal(detectExplicitMediaIntent('I want an image of a luxury watch on black velvet'), 'create_image');
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
