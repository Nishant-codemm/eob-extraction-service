'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig } = require('../src/config');

test('configuration validates required production pseudonymization and provider secrets', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /requires LOG_ID_HMAC_KEY/);
  const config = loadConfig({
    NODE_ENV: 'production', LOG_ID_HMAC_KEY: 'x'.repeat(32),
    MODEL_ADAPTER: 'openai-compatible', LLM_API_URL: 'https://provider.invalid/v1/chat/completions',
    LLM_API_KEY: 'test-only-secret', LLM_MODEL: 'test-model',
  });
  assert.equal(config.modelAdapter, 'openai-compatible');
  assert.equal(config.llmApiKey, 'test-only-secret');
  assert.throws(() => loadConfig({
    MODEL_ADAPTER: 'openai-compatible', LLM_API_URL: 'https://provider.invalid/v1/chat/completions',
  }), /requires LLM_API_URL/);
});
