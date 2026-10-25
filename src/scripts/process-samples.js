'use strict';

const path = require('node:path');
const { loadConfig } = require('../config');
const { createModelAdapter } = require('../adapters/create-model-adapter');
const { SampleDocumentRepository } = require('../persistence/sample-document-repository');
const { FileResultRepository } = require('../persistence/file-result-repository');
const { ExtractionService } = require('../services/extraction-service');

async function main() {
  const config = loadConfig();
  const root = path.resolve(__dirname, '../..');
  const documentRepository = new SampleDocumentRepository(path.join(root, 'samples'));
  const resultRepository = new FileResultRepository(path.resolve(root, config.resultsDir));
  const service = new ExtractionService({
    adapter: createModelAdapter(config), documentRepository, resultRepository, config,
  });

  for (const document of await documentRepository.list()) {
    const outcome = await service.extractRequest({ documentId: document.documentId });
    process.stdout.write(`${document.fileName}: ${outcome.result.header.needs_review ? 'needs review' : 'valid'}\n`);
  }
}

main().catch(() => {
  process.stderr.write('Sample processing failed. Check configuration and service logs.\n');
  process.exitCode = 1;
});
