'use strict';

const MONEY_PATTERN = /^-?(?:0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d{1,2})?$/;

function parseMoneyToCents(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  if (typeof value === 'number' && !Number.isFinite(value)) return undefined;

  const text = String(value).trim();
  if (text.length > 24 || !MONEY_PATTERN.test(text)) return undefined;

  const negative = text.startsWith('-');
  const unsigned = (negative ? text.slice(1) : text).replaceAll(',', '');
  const [whole, fraction = ''] = unsigned.split('.');
  if (whole.replaceAll(',', '').length > 15) return undefined;
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  return negative ? -cents : cents;
}

function centsToDecimalString(cents) {
  if (typeof cents !== 'bigint') throw new TypeError('cents must be a bigint');
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const whole = absolute / 100n;
  const fraction = String(absolute % 100n).padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

module.exports = { centsToDecimalString, parseMoneyToCents };
