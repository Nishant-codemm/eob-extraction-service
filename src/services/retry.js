'use strict';

const { ModelTimeoutError } = require('../errors');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callWithTimeout(adapter, documentText, timeoutMs) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ModelTimeoutError());
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      Promise.resolve().then(() => (
        typeof adapter.extractWithOptions === 'function'
          ? adapter.extractWithOptions(documentText, { signal: controller.signal })
          : adapter.extract(documentText)
      )),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function withRetry(operation, { maxRetries, baseDelayMs, retryIf = (error) => error?.retryable === true, random = Math.random, wait = sleep }) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (attempt >= maxRetries || !retryIf(error, attempt)) throw error;
      const exponential = baseDelayMs * (2 ** attempt);
      const delay = Math.floor(exponential * (0.5 + random()));
      await wait(delay);
    }
  }
}

module.exports = { callWithTimeout, withRetry };
