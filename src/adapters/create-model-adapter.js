'use strict';

const { MockModelAdapter } = require('./mock-adapter');
const { OpenAICompatibleAdapter } = require('./openai-compatible-adapter');

function createModelAdapter(config) {
  if (config.modelAdapter === 'mock') return new MockModelAdapter();
  if (config.modelAdapter === 'openai-compatible') {
    return new OpenAICompatibleAdapter({
      apiUrl: config.llmApiUrl,
      apiKey: config.llmApiKey,
      model: config.llmModel,
    });
  }
  throw new Error('Unsupported model adapter');
}

module.exports = { createModelAdapter };
