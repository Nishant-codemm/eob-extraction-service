'use strict';

const { z } = require('zod');
const { parseMoneyToCents } = require('./money');

const ISO_CURRENCY_CODES = new Set(Intl.supportedValuesOf('currency'));
const nullableText = (max = 500) => z.string().trim().min(1).max(max).nullable().optional().default(null);
const nullableMoney = z.preprocess(
  (value) => value === null || value === undefined ? null : parseMoneyToCents(value),
  z.bigint().nullable(),
).default(null);

const lineSchema = z.strictObject({
  line_number: z.number().int().positive().nullable().optional().default(null),
  line_description: nullableText(1000),
  classification_code: nullableText(64),
  quantity: z.number().finite().positive().max(100_000).nullable().optional().default(null),
  amount_billed: nullableMoney,
  amount_allowed: nullableMoney,
  amount_plan_paid: nullableMoney,
  line_total: nullableMoney,
});

const headerSchema = z.strictObject({
  document_number: nullableText(128),
  document_date: z.union([z.string().date(), z.string().datetime({ offset: true })]).nullable().optional().default(null),
  issuer_name: nullableText(300),
  issuer_id: nullableText(128),
  recipient_name: nullableText(300),
  recipient_id: nullableText(128),
  base_unit: z.string().refine((code) => ISO_CURRENCY_CODES.has(code)).nullable().optional().default(null),
  declared_total: nullableMoney,
  total_billed: nullableMoney,
  total_allowed: nullableMoney,
  total_plan_paid: nullableMoney,
  total_tax_amount: nullableMoney,
});

const extractionSchema = z.strictObject({
  header: headerSchema,
  line_items: z.array(lineSchema).min(1).max(500),
});

const ALLOWED_KEYS = {
  root: new Set(['header', 'line_items']),
  header: new Set([
    'document_number', 'document_date', 'issuer_name', 'issuer_id',
    'recipient_name', 'recipient_id', 'base_unit', 'declared_total',
    'total_billed', 'total_allowed', 'total_plan_paid', 'total_tax_amount',
  ]),
  line: new Set([
    'line_number', 'line_description', 'classification_code', 'quantity',
    'amount_billed', 'amount_allowed', 'amount_plan_paid', 'line_total',
  ]),
};

function projectKnownFields(raw) {
  const unknownFields = [];
  const project = (source, allowed, path) => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) return source;
    const result = {};
    for (const [key, value] of Object.entries(source)) {
      if (!allowed.has(key)) {
        unknownFields.push(`${path}.${key}`);
      } else {
        result[key] = value;
      }
    }
    return result;
  };

  const root = project(raw, ALLOWED_KEYS.root, '$');
  if (root && typeof root === 'object' && !Array.isArray(root)) {
    if (Object.hasOwn(root, 'header')) root.header = project(root.header, ALLOWED_KEYS.header, '$.header');
    if (Array.isArray(root.line_items)) {
      root.line_items = root.line_items.map((line, index) => project(line, ALLOWED_KEYS.line, `$.line_items[${index}]`));
    }
  }
  return { projected: root, unknownFields };
}

module.exports = { extractionSchema, projectKnownFields };
