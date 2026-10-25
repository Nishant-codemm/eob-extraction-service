'use strict';

const { centsToDecimalString } = require('./money');

function reconcile(extraction, validationWarnings = []) {
  const { header, line_items: lines } = extraction;
  const reasons = new Set(validationWarnings);
  let arithmeticValid = header.declared_total !== null;
  let lineSum = 0n;
  const aggregateTotals = {
    amount_billed: 0n,
    amount_allowed: 0n,
    amount_plan_paid: 0n,
  };
  const aggregateAvailable = {
    amount_billed: true,
    amount_allowed: true,
    amount_plan_paid: true,
  };

  for (const [index, line] of lines.entries()) {
    if (line.line_number !== null && line.line_number !== index + 1) reasons.add('line_number_sequence_invalid');
    if (line.line_number === null) reasons.add('line_number_missing');
    if (line.line_description === null) reasons.add('line_description_missing');
    if (line.quantity === null) reasons.add('quantity_missing');
    if (line.amount_billed === null) reasons.add(`line_${index + 1}_amount_billed_missing`);
    for (const field of Object.keys(aggregateTotals)) {
      if (line[field] === null) aggregateAvailable[field] = false;
      else aggregateTotals[field] += line[field];
    }

    const values = [line.amount_allowed, line.amount_plan_paid, line.line_total];
    if (values.some((value) => value === null)) {
      arithmeticValid = false;
      reasons.add('line_arithmetic_value_missing');
      continue;
    }

    if (line.amount_allowed - line.amount_plan_paid !== line.line_total) {
      arithmeticValid = false;
      reasons.add(`line_${index + 1}_allowed_minus_paid_mismatch`);
    }
    lineSum += line.line_total;
  }

  if (header.declared_total === null || lines.some((line) => line.line_total === null)) {
    arithmeticValid = false;
    reasons.add('declared_total_reconciliation_unavailable');
  } else if (lineSum - header.declared_total > 1n || header.declared_total - lineSum > 1n) {
    arithmeticValid = false;
    reasons.add('line_totals_do_not_match_declared_total');
  }

  if (header.document_number === null) reasons.add('document_number_missing');
  if (header.document_date === null) reasons.add('document_date_missing');
  if (header.issuer_name === null || header.recipient_name === null) reasons.add('party_name_missing');
  if (header.issuer_id === null || header.recipient_id === null) reasons.add('party_identifier_missing');
  if (header.base_unit === null) reasons.add('currency_missing');
  if (header.total_billed === null || header.total_allowed === null || header.total_plan_paid === null || header.total_tax_amount === null) {
    reasons.add('header_summary_amount_missing');
  }
  for (const [lineField, headerField] of [
    ['amount_billed', 'total_billed'],
    ['amount_allowed', 'total_allowed'],
    ['amount_plan_paid', 'total_plan_paid'],
  ]) {
    const headerCents = header[headerField];
    if (aggregateAvailable[lineField] && headerCents !== null) {
      const difference = aggregateTotals[lineField] - headerCents;
      if (difference > 1n || difference < -1n) reasons.add(`${lineField}_sum_does_not_match_${headerField}`);
    }
  }

  const outputHeader = {
    ...header,
    declared_total: formatMoney(header.declared_total),
    total_billed: formatMoney(header.total_billed),
    total_allowed: formatMoney(header.total_allowed),
    total_plan_paid: formatMoney(header.total_plan_paid),
    total_tax_amount: formatMoney(header.total_tax_amount),
    is_arithmetic_valid: arithmeticValid,
    needs_review: !arithmeticValid || reasons.size > 0,
    review_reasons: [...reasons].sort(),
  };

  const outputLines = lines.map((line) => ({
    ...line,
    amount_billed: formatMoney(line.amount_billed),
    amount_allowed: formatMoney(line.amount_allowed),
    amount_plan_paid: formatMoney(line.amount_plan_paid),
    line_total: formatMoney(line.line_total),
  }));

  return { header: outputHeader, line_items: outputLines };
}

function formatMoney(cents) {
  return cents === null ? null : centsToDecimalString(cents);
}

module.exports = { reconcile };
