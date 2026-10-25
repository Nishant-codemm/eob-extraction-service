'use strict';

const { InvalidModelOutputError } = require('../errors');

const MAX_COMPLETION_LENGTH = 1_000_000;

function findJsonObjects(text) {
  const ranges = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      if (depth === 0) start = index;
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth < 0) return [];
      if (depth === 0 && start >= 0) {
        ranges.push([start, index + 1]);
        start = -1;
      }
    }
  }
  return depth === 0 && !inString ? ranges : [];
}

function removeTrailingCommas(jsonText) {
  let result = '';
  let inString = false;
  let escaped = false;

  for (let index = 0; index < jsonText.length; index += 1) {
    const char = jsonText[index];
    if (inString) {
      result += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      result += char;
      continue;
    }
    if (char === ',') {
      let lookahead = index + 1;
      while (lookahead < jsonText.length && /\s/.test(jsonText[lookahead])) lookahead += 1;
      if (jsonText[lookahead] === '}' || jsonText[lookahead] === ']') continue;
    }
    result += char;
  }
  return result;
}

function hasDuplicateJsonKeys(source) {
  let index = 0;
  const skipWhitespace = () => {
    while (index < source.length && /\s/.test(source[index])) index += 1;
  };
  const parseString = () => {
    const start = index;
    index += 1;
    while (index < source.length) {
      if (source[index] === '\\') index += 2;
      else if (source[index++] === '"') return JSON.parse(source.slice(start, index));
    }
    throw new Error('invalid string token');
  };
  const parseObject = (depth) => {
    index += 1;
    skipWhitespace();
    const keys = new Set();
    if (source[index] === '}') { index += 1; return false; }
    while (index < source.length) {
      skipWhitespace();
      const key = parseString();
      if (keys.has(key)) return true;
      keys.add(key);
      skipWhitespace();
      if (source[index++] !== ':') throw new Error('invalid object token');
      if (parseValue(depth + 1)) return true;
      skipWhitespace();
      if (source[index] === '}') { index += 1; return false; }
      if (source[index++] !== ',') throw new Error('invalid object token');
    }
    throw new Error('invalid object token');
  };
  const parseArray = (depth) => {
    index += 1;
    skipWhitespace();
    if (source[index] === ']') { index += 1; return false; }
    while (index < source.length) {
      if (parseValue(depth + 1)) return true;
      skipWhitespace();
      if (source[index] === ']') { index += 1; return false; }
      if (source[index++] !== ',') throw new Error('invalid array token');
    }
    throw new Error('invalid array token');
  };
  const parseValue = (depth) => {
    if (depth > 100) throw new Error('JSON nesting limit exceeded');
    skipWhitespace();
    if (source[index] === '{') return parseObject(depth);
    if (source[index] === '[') return parseArray(depth);
    if (source[index] === '"') { parseString(); return false; }
    const start = index;
    while (index < source.length && !/[\s,\]}]/.test(source[index])) index += 1;
    if (index === start) throw new Error('invalid value token');
    return false;
  };

  try {
    const duplicates = parseValue(0);
    skipWhitespace();
    return duplicates || index !== source.length;
  } catch {
    return true;
  }
}

function parseCompletion(raw) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_COMPLETION_LENGTH) {
    throw new InvalidModelOutputError();
  }

  const ranges = findJsonObjects(raw);
  if (ranges.length !== 1) throw new InvalidModelOutputError();

  const [start, end] = ranges[0];
  const candidate = raw.slice(start, end);
  const wrapped = raw.slice(0, start).trim().length > 0 || raw.slice(end).trim().length > 0;
  const repairedCandidate = removeTrailingCommas(candidate);
  const repaired = repairedCandidate !== candidate;

  try {
    if (hasDuplicateJsonKeys(repairedCandidate)) throw new Error('duplicate or malformed JSON keys');
    const value = JSON.parse(repairedCandidate);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('root must be object');
    return { value, warnings: [...(wrapped ? ['completion_wrapper_removed'] : []), ...(repaired ? ['trailing_comma_repaired'] : [])] };
  } catch {
    throw new InvalidModelOutputError();
  }
}

module.exports = { hasDuplicateJsonKeys, parseCompletion, removeTrailingCommas };
