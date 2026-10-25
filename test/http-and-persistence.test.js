'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const request = require('supertest');
const { createApp } = require('../src/http/app');
const { FileResultRepository } = require('../src/persistence/file-result-repository');
const { SampleDocumentRepository } = require('../src/persistence/sample-document-repository');

test('HTTP validation rejects malformed, extra, and ambiguous request bodies', async () => {
  const app = createApp({ extractionService: {}, logger: { info() {} } });
  for (const body of [{}, { text: 'x', documentId: 'y' }, { text: 'x', extra: true }]) {
    const response = await request(app).post('/extract').send(body);
    assert.equal(response.status, 400);
  }
  const malformed = await request(app).post('/extract').set('content-type', 'application/json').send('{');
  assert.equal(malformed.status, 400);
  assert.ok(malformed.headers['x-request-id']);
});

test('HTTP errors do not expose thrown provider details or stack traces and logs stay allowlisted', async () => {
  const logs = [];
  const app = createApp({
    extractionService: { extractRequest: async () => { throw new Error('secret patient payload and stack'); } },
    logger: { info(fields) { logs.push(fields); } },
  });
  const response = await request(app).post('/extract').set('x-request-id', 'untrusted-client-value').send({ documentId: 'sample-1' });
  assert.equal(response.status, 500);
  assert.equal(JSON.stringify(response.body).includes('secret patient'), false);
  assert.equal(JSON.stringify(response.body).includes('stack'), false);
  assert.deepEqual(Object.keys(logs[0]).sort(), ['documentId', 'latencyMs', 'outcome', 'requestId']);
  assert.equal(JSON.stringify(logs).includes('sample-1'), false);
  assert.notEqual(logs[0].requestId, 'untrusted-client-value');
});

test('HTTP endpoint returns a successful result and an idempotent replay marker', async () => {
  const result = { header: { needs_review: true }, line_items: [] };
  const app = createApp({
    extractionService: { extractRequest: async () => ({ result, cached: true }) },
    logger: { info() {} },
  });
  const response = await request(app).post('/extract').send({ text: 'unseen document text' });
  assert.equal(response.status, 200);
  assert.equal(response.body.header.needs_review, true);
  assert.equal(response.body.idempotent_replay, true);
});

test('file result repository atomically persists and rejects unsafe keys', async (t) => {
  const directory = path.join(__dirname, `.tmp-results-${randomUUID()}`);
  await fs.mkdir(directory, { recursive: true });
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const repository = new FileResultRepository(directory);
  const result = {
    header: {
      document_number: 'CL-1', document_date: '2026-01-01', issuer_name: 'Payer', issuer_id: 'P1',
      recipient_name: 'Member', recipient_id: 'M1', base_unit: 'USD', declared_total: '0.00',
      total_billed: '0.00', total_allowed: '0.00', total_plan_paid: '0.00', total_tax_amount: '0.00',
      is_arithmetic_valid: true, needs_review: false, review_reasons: [],
    },
    line_items: [{
      line_number: 1, line_description: 'Service', classification_code: null, quantity: 1,
      amount_billed: '0.00', amount_allowed: '0.00', amount_plan_paid: '0.00', line_total: '0.00',
    }],
  };
  await repository.writeAtomic('01_eob_test', result);
  assert.deepEqual(await repository.read('01_eob_test'), result);
  assert.deepEqual((await fs.readdir(directory)).sort(), ['01_eob_test.json']);
  await assert.rejects(repository.writeAtomic('../escape', result));
});

test('sample repository resolves only discovered documents and blocks traversal IDs', async (t) => {
  const directory = path.join(__dirname, `.tmp-samples-${randomUUID()}`);
  await fs.mkdir(directory, { recursive: true });
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.writeFile(path.join(directory, 'sample-one.txt'), 'Claim Number: AB-1\nDocument');
  const repository = new SampleDocumentRepository(directory);
  assert.equal((await repository.resolve('AB-1')).sampleId, 'sample-one');
  assert.equal((await repository.resolve('sample-one.txt')).documentNumber, 'AB-1');
  await assert.rejects(repository.resolve('../outside'), { code: 'DOCUMENT_NOT_FOUND' });
});
