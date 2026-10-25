'use strict';

const pino = require('pino');

function createLogger(environment = 'development') {
  return pino({
    level: environment === 'test' ? 'silent' : 'info',
    base: null,
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: ['req.headers.authorization', 'headers.authorization', 'apiKey', 'llmApiKey'],
      remove: true,
    },
  });
}

module.exports = { createLogger };
