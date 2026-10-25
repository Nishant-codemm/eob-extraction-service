'use strict';

const { ModelCallError } = require('../errors');

const mock = require('../../mock-llm/mockLlm.js');

class MockModelAdapter {
  async extract(documentText) {
    try {
      return await mock.extract(documentText);
    } catch (error) {
      const transient = /upstream 503/i.test(error?.message || '');
      throw new ModelCallError('Mock model request failed', { retryable: transient, cause: error });
    }
  }
}

module.exports = { MockModelAdapter };
