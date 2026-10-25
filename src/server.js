'use strict';

const path = require('node:path');
const { loadConfig } = require('./config');
const { createLogger } = require('./logger');
const { createModelAdapter } = require('./adapters/create-model-adapter');
const { SampleDocumentRepository } = require('./persistence/sample-document-repository');
const { FileResultRepository } = require('./persistence/file-result-repository');
const { ExtractionService } = require('./services/extraction-service');
const { createApp } = require('./http/app');

function buildDependencies(config = loadConfig(), overrides = {}) {
  const logger = overrides.logger || createLogger(config.environment);
  const projectRoot = path.resolve(__dirname, '..');
  const samplesDir = path.join(projectRoot, 'samples');
  const resultsDir = path.resolve(projectRoot, config.resultsDir);
  const documentRepository = overrides.documentRepository || new SampleDocumentRepository(samplesDir);
  const resultRepository = overrides.resultRepository || new FileResultRepository(resultsDir);
  const adapter = overrides.adapter || createModelAdapter(config);
  const extractionService = overrides.extractionService || new ExtractionService({
    adapter,
    documentRepository,
    resultRepository,
    config,
  });

  return { logger, extractionService, documentRepository, resultRepository, adapter, logIdHmacKey: config.logIdHmacKey };
}

function createServerApp(config, overrides) {
  const dependencies = buildDependencies(config, overrides);
  const app = createApp({
    extractionService: dependencies.extractionService,
    logger: dependencies.logger,
    logIdHmacKey: dependencies.logIdHmacKey,
  });
  return { app, dependencies };
}

if (require.main === module) {
  let config;
  try {
    config = loadConfig();
  } catch {
    process.stderr.write('Startup failed: application configuration is invalid.\n');
    process.exitCode = 1;
  }

  if (config) {
    const { app, dependencies } = createServerApp(config);
    const server = app.listen(config.port, () => {
      dependencies.logger.info({ outcome: 'started' }, 'service started');
    });

    const shutdown = () => server.close(() => process.exit(0));
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }
}

module.exports = { buildDependencies, createServerApp };
