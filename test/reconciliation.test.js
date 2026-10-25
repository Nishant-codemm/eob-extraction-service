'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { extractionSchema, projectKnownFields } = require('../src/domain/model-schema');
const { reconcile } = require('../src/domain/reconcile');

function payload(overrides = {}) {
  return {
    header: {
      document_number: 'CL-1', document_date: '2026-01-01', issuer_name: 'Payer', issuer_id: 'P1',
      recipient_name: 'Member', recipient_id: 'M1', base_unit: 'USD', declared_total: '10.00',
      total_billed: '20.00', total_allowed: '15.00', total_plan_paid: '5.00', total_tax_amount: '0.00',
    },
    line_items: [{
      line_number: 1, line_description: 'Service', classification_code: null, quantity: 1,
      amount_billed: '20.00', amount_allowed: '15.00', amount_plan_paid: '5.00', line_total: '10.00',
    }],
    ...overrides,
  };
}

test('strict schema coerces exact money formats and rejects invalid types', () => {
  const valid = extractionSchema.safeParse(payload());
  assert.equal(valid.success, true);
  assert.equal(valid.data.header.total_billed, 2000n);

  const invalid = payload();
  invalid.line_items[0].quantity = 'one';
  assert.equal(extractionSchema.safeParse(invalid).success, false);
});

test('unknown fields are stripped explicitly and produce review reasons', () => {
  const { projected, unknownFields } = projectKnownFields({
    ...payload(), extra: 'discard', header: { ...payload().header, notes: 'discard' },
  });
  assert.deepEqual(unknownFields.sort(), ['$.extra', '$.header.notes']);
  assert.equal(extractionSchema.safeParse(projected).success, true);
  const normalized = extractionSchema.parse(projected);
  const result = reconcile(normalized, unknownFields.map((field) => `unexpected_field:${field}`));
  assert.equal(result.header.is_arithmetic_valid, true);
  assert.equal(result.header.needs_review, true);
  assert.equal(result.header.review_reasons.length, 2);
  assert.equal(Object.hasOwn(result, 'extra'), false);
});

test('reconciliation preserves wrong values and marks line and total mismatches', () => {
  const broken = payload();
  broken.line_items[0].line_total = '12.00';
  const result = reconcile(extractionSchema.parse(broken));
  assert.equal(result.line_items[0].line_total, '12.00');
  assert.equal(result.header.declared_total, '10.00');
  assert.equal(result.header.is_arithmetic_valid, false);
  assert.equal(result.header.needs_review, true);
  assert.ok(result.header.review_reasons.includes('line_1_allowed_minus_paid_mismatch'));
  assert.ok(result.header.review_reasons.includes('line_totals_do_not_match_declared_total'));
});

test('one-cent tolerance applies to declared total while each line must match exactly', () => {
  const nearlyBalanced = payload();
  nearlyBalanced.header.declared_total = '10.01';
  const result = reconcile(extractionSchema.parse(nearlyBalanced));
  assert.equal(result.header.is_arithmetic_valid, true);

  const lineOffByCent = payload();
  lineOffByCent.line_items[0].line_total = '10.01';
  const lineResult = reconcile(extractionSchema.parse(lineOffByCent));
  assert.equal(lineResult.header.is_arithmetic_valid, false);
});

test('header aggregate mismatches require review without changing the assignment arithmetic flag', () => {
  const inconsistentSummary = payload();
  inconsistentSummary.header.total_billed = '21.00';
  const result = reconcile(extractionSchema.parse(inconsistentSummary));
  assert.equal(result.header.is_arithmetic_valid, true);
  assert.equal(result.header.needs_review, true);
  assert.ok(result.header.review_reasons.includes('amount_billed_sum_does_not_match_total_billed'));
});

test('schema accepts ISO datetimes and rejects a non-ISO currency code', () => {
  const validDateTime = payload();
  validDateTime.header.document_date = '2026-01-01T12:30:00Z';
  assert.equal(extractionSchema.safeParse(validDateTime).success, true);
  const invalidCurrency = payload();
  invalidCurrency.header.base_unit = 'ZZZ';
  assert.equal(extractionSchema.safeParse(invalidCurrency).success, false);
});
