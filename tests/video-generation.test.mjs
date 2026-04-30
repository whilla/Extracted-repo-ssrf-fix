import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVideoProviderAttemptOrder,
  isReachableOpenLtxEndpoint,
  pickMoreRelevantVideoError,
} from '../lib/services/videoGenerationService.ts';

test('cloud video generation skips open fallback when no reachable open endpoint exists', () => {
  assert.deepEqual(buildVideoProviderAttemptOrder('ltx23', true, false), ['ltx23']);
});

test('open endpoint reachability treats loopback as local-only', () => {
  assert.equal(
    isReachableOpenLtxEndpoint('http://127.0.0.1:8000/generate', 'localhost'),
    true
  );
  assert.equal(
    isReachableOpenLtxEndpoint('http://127.0.0.1:8000/generate', 'extractedproject-theta.vercel.app'),
    false
  );
  assert.equal(
    isReachableOpenLtxEndpoint('https://ltx.example.com/generate', 'extractedproject-theta.vercel.app'),
    true
  );
});

test('video error selection preserves a useful provider error over a generic fetch miss', () => {
  const specificError = new Error('LTX video error (401): unauthorized');
  const genericError = new Error('Failed to fetch');

  assert.equal(pickMoreRelevantVideoError(null, genericError), genericError);
  assert.equal(pickMoreRelevantVideoError(specificError, genericError), specificError);
});
