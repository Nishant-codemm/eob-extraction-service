'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ExtractionService } = require('../src/services/extraction-service');
const { ModelTimeoutError, InvalidModelOutputError } = require('../src/errors');

const validCompletion = JSON.stringify({
  header: {
    document_number: 'CL-1', document_date: '2026-01-01', issuer_name: 'Payer', issuer_id: 'P1',
    recipient_name: 'Member', recipient_id: 'M1', base_unit: 'USD', declared_total: '10.00',
    total_billed: '20.00', total_allowed: '15.00', total_plan_paid: '5.00', total_tax_amount: '0.00',
  },
  line_items: [{ line_number: 1, line_description: 'Service', classification_code: null, quantity: 1,
    amount_billed: '20.00', amount_allowed: '15.00', amount_plan_paid: '5.00', line_total: '10.00' }],
});

function harness(adapter) {
  const writes = new Map();
  const document = { documentId: 'CL-1', documentNumber: 'CL-1', resultKey: 'doc-one', text: 'Claim Number: CL-1' };
  const documentRepository = {
    resolve: async () => document,
    identifyText: async () => document,
  };
  const resultRepository = {
    read: async (key) => writes.get(key) || null,
    writeAtomic: async (key, result) => writes.set(key, result),
  };
  const config = { modelTimeoutMs: 100, maxRetries: 2, retryBaseDelayMs: 0 };
  return { service: new ExtractionService({ adapter, documentRepository, resultRepository, config }), writes };
}

test('service retries one invalid completion and produces reconciled result', async () => {
  let calls = 0;
  const { service, writes } = harness({ extract: async () => (++calls === 1 ? 'not json' : validCompletion) });
  const response = await service.extractRequest({ documentId: 'CL-1' });
  assert.equal(calls, 2);
  assert.equal(response.result.header.is_arithmetic_valid, true);
  assert.equal(writes.size, 1);
});

test('service calls the primary adapter contract with document text only', async () => {
  let argumentCount;
  const { service } = harness({ extract: async function (text) {
    argumentCount = arguments.length;
    assert.equal(text, 'Claim Number: CL-1');
    return validCompletion;
  } });
  await service.extractRequest({ documentId: 'CL-1' });
  assert.equal(argumentCount, 1);
});

test('service returns a clean validation error after bounded invalid output retries', async () => {
  let calls = 0;
  const { service, writes } = harness({ extract: async () => { calls += 1; return 'not json'; } });
  await assert.rejects(service.extractRequest({ documentId: 'CL-1' }), InvalidModelOutputError);
  assert.equal(calls, 2);
  assert.equal(writes.size, 0);
});

test('service retries a transient upstream failure and persists only on success', async () => {
  let calls = 0;
  const { service } = harness({ extract: async () => {
    calls += 1;
    if (calls === 1) throw Object.assign(new Error('private provider detail'), { retryable: true });
    return validCompletion;
  } });
  const response = await service.extractRequest({ documentId: 'CL-1' });
  assert.equal(calls, 2);
  assert.equal(response.result.header.needs_review, false);
});

test('service flags a model claim number that disagrees with the input document', async () => {
  const wrongClaim = JSON.parse(validCompletion);
  wrongClaim.header.document_number = 'CL-OTHER';
  const { service } = harness({ extract: async () => JSON.stringify(wrongClaim) });
  const response = await service.extractRequest({ documentId: 'CL-1' });
  assert.equal(response.result.header.document_number, 'CL-OTHER');
  assert.equal(response.result.header.needs_review, true);
  assert.ok(response.result.header.review_reasons.includes('document_number_does_not_match_input'));
});

test('service deduplicates concurrent requests and cached replays', async () => {
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { service } = harness({ extract: async () => { calls += 1; await gate; return validCompletion; } });
  const first = service.extractRequest({ documentId: 'CL-1' });
  const second = service.extractRequest({ documentId: 'CL-1' });
  await new Promise((resolve) => setImmediate(resolve));
  release();
  const [one, two] = await Promise.all([first, second]);
  const replay = await service.extractRequest({ documentId: 'CL-1' });
  assert.equal(calls, 1);
  assert.deepEqual(one.result, two.result);
  assert.equal(replay.cached, true);
});

test('timeout wrapper rejects slow providers with a typed retryable error', async () => {
  const { service } = harness({ extractWithOptions: async (_text, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }) });
  await assert.rejects(service.extractRequest({ documentId: 'CL-1' }), ModelTimeoutError);
});
