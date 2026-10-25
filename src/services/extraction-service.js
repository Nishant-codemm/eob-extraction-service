'use strict';

const { extractionSchema, projectKnownFields } = require('../domain/model-schema');
const { parseCompletion } = require('../domain/parse-completion');
const { reconcile } = require('../domain/reconcile');
const { InvalidModelOutputError } = require('../errors');
const { callWithTimeout, withRetry } = require('./retry');

class ExtractionService {
  constructor({ adapter, documentRepository, resultRepository, config }) {
    this.adapter = adapter;
    this.documentRepository = documentRepository;
    this.resultRepository = resultRepository;
    this.config = config;
    this.inFlight = new Map();
  }

  async extractRequest(input) {
    const document = input.documentId
      ? await this.documentRepository.resolve(input.documentId)
      : await this.documentRepository.identifyText(input.text);

    const existing = await this.resultRepository.read(document.resultKey);
    if (existing) return { result: existing, documentId: document.documentId, cached: true };

    const ongoing = this.inFlight.get(document.resultKey);
    if (ongoing) {
      const result = await ongoing;
      return { result, documentId: document.documentId, cached: true };
    }

    const work = this.#process(document);
    this.inFlight.set(document.resultKey, work);
    try {
      const result = await work;
      return { result, documentId: document.documentId, cached: false };
    } finally {
      if (this.inFlight.get(document.resultKey) === work) this.inFlight.delete(document.resultKey);
    }
  }

  async #process(document) {
    let normalized;
    try {
      normalized = await withRetry(async () => {
        const raw = await callWithTimeout(this.adapter, document.text, this.config.modelTimeoutMs);
        const parsed = parseCompletion(raw);
        const { projected, unknownFields } = projectKnownFields(parsed.value);
        const validation = extractionSchema.safeParse(projected);
        if (!validation.success) throw new InvalidModelOutputError();
        const warnings = [
          ...parsed.warnings,
          ...unknownFields.map((field) => `unexpected_field:${field}`),
        ];
        if (document.documentNumber && validation.data.header.document_number
          && validation.data.header.document_number !== document.documentNumber) {
          warnings.push('document_number_does_not_match_input');
        }
        return {
          value: validation.data,
          warnings,
        };
      }, {
        maxRetries: this.config.maxRetries,
        baseDelayMs: this.config.retryBaseDelayMs,
        retryIf: (error, attempt) => error?.retryable === true
          || (error instanceof InvalidModelOutputError && attempt < 1),
      });
    } catch (error) {
      if (error instanceof InvalidModelOutputError) throw error;
      throw error;
    }

    const result = reconcile(normalized.value, normalized.warnings);
    await this.resultRepository.writeAtomic(document.resultKey, result);
    return result;
  }
}

module.exports = { ExtractionService };
