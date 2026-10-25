'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { DocumentNotFoundError } = require('../errors');

const CLAIM_PATTERN = /Claim Number:\s*([A-Z0-9-]+)/i;

class SampleDocumentRepository {
  constructor(samplesDir) {
    this.samplesDir = samplesDir;
    this.cache = null;
  }

  async list() {
    if (!this.cache) this.cache = await this.#load();
    return this.cache;
  }

  async resolve(documentId) {
    const documents = await this.list();
    const found = documents.find((document) => document.fileName === documentId
      || document.sampleId === documentId
      || document.documentNumber === documentId);
    if (!found) throw new DocumentNotFoundError();
    return found;
  }

  async identifyText(text) {
    const hash = createHash('sha256').update(text).digest('hex');
    const documents = await this.list();
    const exactSample = documents.find((document) => document.text === text);
    if (exactSample) return exactSample;
    const claim = text.match(CLAIM_PATTERN)?.[1] || null;
    return {
      documentId: claim || `text-${hash.slice(0, 20)}`,
      documentNumber: claim,
      fileName: null,
      resultKey: `text-${hash}`,
      text,
    };
  }

  async #load() {
    const entries = await fs.readdir(this.samplesDir, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.txt'));
    const docs = await Promise.all(files.map(async (entry) => {
      const text = await fs.readFile(path.join(this.samplesDir, entry.name), 'utf8');
      const documentNumber = text.match(CLAIM_PATTERN)?.[1] || null;
      const sampleId = path.basename(entry.name, path.extname(entry.name));
      return {
        documentId: documentNumber || sampleId,
        documentNumber,
        fileName: entry.name,
        resultKey: sampleId,
        sampleId,
        text,
      };
    }));
    return docs.sort((left, right) => left.fileName.localeCompare(right.fileName));
  }
}

module.exports = { SampleDocumentRepository };
