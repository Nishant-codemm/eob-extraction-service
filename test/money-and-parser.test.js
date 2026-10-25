'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseMoneyToCents, centsToDecimalString } = require('../src/domain/money');
const { parseCompletion } = require('../src/domain/parse-completion');
const { InvalidModelOutputError } = require('../src/errors');

test('money parsing uses exact cents and accepts documented separators', () => {
  assert.equal(parseMoneyToCents('1,450.00'), 145000n);
  assert.equal(parseMoneyToCents('0.1'), 10n);
  assert.equal(parseMoneyToCents(-0.25), -25n);
  assert.equal(centsToDecimalString(-25n), '-0.25');
});

test('money parsing rejects ambiguous or over-precision values', () => {
  for (const value of ['1,45.00', '1.234', 'NaN', 'Infinity', '01.00', '', '999999999999999999999999.00']) {
    assert.equal(parseMoneyToCents(value), undefined, value);
  }
});

test('completion parser extracts a single wrapped object and repairs trailing commas', () => {
  const parsed = parseCompletion('Here is JSON:\n```json\n{"note":"comma,}","line_items":[],}\n```');
  assert.deepEqual(parsed.value, { note: 'comma,}', line_items: [] });
  assert.deepEqual(parsed.warnings, ['completion_wrapper_removed', 'trailing_comma_repaired']);
});

test('completion parser rejects ambiguous and malformed completions safely', () => {
  assert.throws(() => parseCompletion('{"a":1} followed by {"b":2}'), InvalidModelOutputError);
  assert.throws(() => parseCompletion('no structured response'), InvalidModelOutputError);
  assert.throws(() => parseCompletion('{"a":'), InvalidModelOutputError);
  assert.throws(() => parseCompletion('x'.repeat(1_000_001)), InvalidModelOutputError);
  assert.throws(() => parseCompletion('{"header":{"value":1,"value":2},"line_items":[]}'), InvalidModelOutputError);
});
