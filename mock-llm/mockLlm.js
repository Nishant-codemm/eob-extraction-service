// mockLlm.js - a stand-in for a real language model, for the R2 assignment.
//
// It returns a RAW completion string per document, exactly as a real model would:
// sometimes clean JSON, sometimes wrapped in prose or markdown, sometimes malformed or
// internally inconsistent. Your service must be robust to all of it. You may replace
// this module with a real model behind the same interface (extract(documentText)).
//
// Usage:
//   const { extract } = require('./mockLlm');
//   const raw = await extract(documentText);   // returns a string, NOT parsed JSON
//
const fs = require('fs');
const path = require('path');

const RESPONSES = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'responses.json'), 'utf8'));

// Simulate a flaky upstream: a small, deterministic chance of a slow/failed call.
function flake(claim) {
  // 4th character of the claim decides; keeps it deterministic per document.
  const c = (claim.charCodeAt(3) || 0) % 7;
  return { slowMs: c === 0 ? 1500 : 0, fail: c === 1 };
}

async function extract(documentText) {
  const m = String(documentText).match(/Claim Number:\s*([A-Z0-9-]+)/i);
  const claim = m ? m[1] : null;
  if (!claim || !RESPONSES[claim]) {
    throw new Error('mock model: no response configured for this document');
  }
  const { slowMs, fail } = flake(claim);
  if (slowMs) await new Promise(r => setTimeout(r, slowMs));
  if (fail) throw new Error('mock model: upstream 503 (simulated)');
  return RESPONSES[claim];
}

module.exports = { extract };
