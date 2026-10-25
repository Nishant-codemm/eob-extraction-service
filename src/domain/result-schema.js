'use strict';

const { z } = require('zod');
const { parseMoneyToCents } = require('./money');

const ISO_CURRENCY_CODES = new Set(Intl.supportedValuesOf('currency'));
const moneyString = z.string().max(18).regex(/^-?(?:0|[1-9]\d*)\.\d{2}$/).nullable();
const nullableText = (max = 1000) => z.string().min(1).max(max).nullable();

const resultLineSchema = z.strictObject({
  line_number: z.number().int().positive().nullable(),
  line_description: nullableText(),
  classification_code: nullableText(64),
  quantity: z.number().finite().positive().max(100_000).nullable(),
  amount_billed: moneyString,
  amount_allowed: moneyString,
  amount_plan_paid: moneyString,
  line_total: moneyString,
});

const resultHeaderSchema = z.strictObject({
  document_number: nullableText(128),
  document_date: z.union([z.string().date(), z.string().datetime({ offset: true })]).nullable(),
  issuer_name: nullableText(300),
  issuer_id: nullableText(128),
  recipient_name: nullableText(300),
  recipient_id: nullableText(128),
  base_unit: z.string().refine((code) => ISO_CURRENCY_CODES.has(code)).nullable(),
  declared_total: moneyString,
  total_billed: moneyString,
  total_allowed: moneyString,
  total_plan_paid: moneyString,
  total_tax_amount: moneyString,
  is_arithmetic_valid: z.boolean(),
  needs_review: z.boolean(),
  review_reasons: z.array(z.string().min(1).max(200)),
});

const resultSchema = z.strictObject({
  header: resultHeaderSchema,
  line_items: z.array(resultLineSchema).min(1).max(500),
}).superRefine((result, context) => {
  const { header, line_items: lines } = result;
  let valid = header.declared_total !== null;
  let sum = 0n;
  for (const line of lines) {
    const allowed = parseMoneyToCents(line.amount_allowed);
    const paid = parseMoneyToCents(line.amount_plan_paid);
    const owed = parseMoneyToCents(line.line_total);
    if (allowed === undefined || paid === undefined || owed === undefined) {
      valid = false;
    } else {
      if (allowed - paid !== owed) valid = false;
      sum += owed;
    }
  }

  const declared = parseMoneyToCents(header.declared_total);
  if (declared === undefined || lines.some((line) => line.line_total === null) || abs(sum - (declared ?? 0n)) > 1n) valid = false;
  if (header.is_arithmetic_valid !== valid) {
    context.addIssue({ code: 'custom', path: ['header', 'is_arithmetic_valid'], message: 'Arithmetic flag does not match stored values' });
  }
  if (header.needs_review !== (!valid || header.review_reasons.length > 0)) {
    context.addIssue({ code: 'custom', path: ['header', 'needs_review'], message: 'Review flag does not match review reasons' });
  }
});

function abs(value) {
  return value < 0n ? -value : value;
}

module.exports = { resultSchema };
