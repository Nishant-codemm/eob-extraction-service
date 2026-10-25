# EOB Extraction Service

A Node.js and Express service that treats model output as untrusted input. It validates the output at runtime, reconciles money using integer cents, flags uncertainty for review, and persists completed results atomically.

## Run locally

Requires a supported Node.js LTS release (22 or newer) and npm.

```sh
npm ci
npm run demo
```

`npm run demo` processes the five sample documents and starts the API. The five required `results/*.json` artifacts are included; on a fresh clone the sample command validates and reuses them idempotently. `npm start` starts only the API. The primary assignment flow uses the supplied mock unchanged. It only has responses for the five included claims; it is for local fixtures and does not extract arbitrary documents. The mock's deterministic fault selector happens to choose its failure branch for the supplied claim numbers, so calls may exhaust retries; if the persisted result artifacts are removed, the mock cannot regenerate them. This is behavior in the provided fixture, not altered in the application. Retry and timeout scenarios are covered with test-only fake adapters. The OpenAI-compatible adapter is an optional extension; configure it only when intentionally testing unseen documents, using environment variables or a local `.env` based on `.env.example`:

```text
MODEL_ADAPTER=openai-compatible
LLM_API_URL=https://provider.example/v1/chat/completions
LLM_API_KEY=<injected-at-runtime>
LLM_MODEL=<configured-model-name>
```

Never put a real key in `.env.example` or commit `.env`. The `.env` file is ignored by Git. The endpoint is `POST /extract` and accepts exactly one of:

```json
{ "documentId": "01_eob_northwind" }
```

`documentId` can be a sample basename, sample filename, or claim number discovered by scanning the sample directory. Alternatively, send `{ "text": "...document text..." }`. Repeated sample IDs return the persisted result; repeated identical text is keyed by a SHA-256 digest. `npm run samples` writes one result per supplied sample to `results/<sample-basename>.json`.

The success response includes `idempotent_replay: true` when it served a cached result. Run tests with `npm test`.

## Architecture

The code is separated into HTTP validation/error mapping, document and result repositories, model adapters, completion parsing, Zod validation, reconciliation, and orchestration. The primary adapter contract is `extract(documentText)`. The optional OpenAI-compatible adapter also exposes an internal `extractWithOptions(documentText, { signal })` capability for cancellation; adapters without that capability are called through the one-argument contract and remain timeout-bounded by the service.

Money strings are parsed directly into `BigInt` minor units (cents for USD), with input length and magnitude bounds. Comparisons and sums never use binary floating point. Persisted JSON serializes money as fixed two-decimal strings so values remain exact and readable. A tolerance of one cent applies to the sum of line totals versus `declared_total`; each line's allowed-minus-paid amount must match its line total exactly. Billed, allowed, and plan-paid summary totals are also compared to line aggregates; such discrepancies add a review reason without changing the assignment-defined `is_arithmetic_valid` flag.

The completion parser extracts a single balanced JSON object while respecting quoted strings, strips surrounding prose/markdown by selecting that object, and removes trailing commas only outside strings. It caps completion size and rejects ambiguous/malformed payloads. A strict Zod schema validates a whitelist projection; unknown properties are discarded and each occurrence adds a review reason. Invalid output gets one retry, while transient provider errors and timeouts use the configured bounded retry count with exponential backoff and jitter. A timeout aborts adapters that support `AbortSignal` and returns promptly even when an adapter cannot be cancelled.

Arithmetic mismatches are successful extractions with `is_arithmetic_valid: false` and `needs_review: true`; their returned amounts are preserved. Unparseable or structurally invalid model output returns a safe error and is not persisted. Missing values remain `null`; missing data required for trustworthy reconciliation is flagged.

The file repository writes a unique temporary file in `results/` and renames it into place only after serialization succeeds. In-process requests for the same result key share one in-flight operation, and persisted results make subsequent calls idempotent. This file-backed design is appropriate for the single-instance assignment. A multi-process deployment should move idempotency and persistence to a transactional database with a unique document key; local in-memory request coalescing is not a distributed lock.

## Failure handling

| Failure | Behavior |
|---|---|
| Invalid request JSON, wrong request shape, extra request field | Safe `400` response; request ID is still logged. |
| Unknown sample `documentId` | `404`, with no filesystem path constructed from user input. |
| Prose, markdown, trailing comma | Extract one object; trailing commas are repaired outside strings. Normalization is recorded as a review reason. |
| Ambiguous or malformed JSON, wrong type, invalid schema | One bounded retry; then safe `502` without a stack trace or persisted partial record. |
| Unexpected model fields | Strip unknown fields before strict validation and flag the result for review. |
| Timeout or transient provider failure | Abort where possible; bounded exponential backoff with jitter. On exhaustion, return a clean error and persist nothing. |
| Non-reconciling numbers | Preserve model values and store a flagged result for human review. |
| File write error | Remove the temporary file and return a safe server error. Rename is the commit point. |
| Duplicate request | Return the existing result or share an in-flight request for that key. |

The mock source and response fixture are copied byte-for-byte from the supplied starter archive. Its deterministic fault selector chooses the failure branch for the supplied claim numbers, so mock-backed calls can exhaust retries. The application does not change this fixture behavior. Transient and timeout recovery are exercised only through fake adapters in the test suite. The mock has no configured completion for unseen claims; the optional provider adapter can be selected for unseen-document evaluation.

## Secrets and privacy

Configuration is read from environment variables and validated at startup. Logs are allowlisted to a server-generated request ID, an HMAC-pseudonymized document ID, latency, and outcome; Pino supplies a timestamp. Set `LOG_ID_HMAC_KEY` to a random value of at least 32 characters to keep pseudonyms correlatable across restarts. If unset in local development, the process uses a random in-memory key. No request body, document text, member fields, raw provider response, authorization header, or exception object is logged. Error responses contain stable codes and safe messages only.

**Note on `mock-llm/responses.json`:** This file is the assignment-supplied fixture, copied byte-for-byte from the starter archive and not modified. The Summit Point (SP-2026-6620884) entry in that fixture contains a string that resembles an API key (`OPENAI_API_KEY=sk-live-…`). This is a **deliberate synthetic test vector placed by the assignment authors** to simulate a model response that leaks a credential in its prose wrapper — it is not a real key and was not added by this implementation. The service never logs, stores, or forwards the raw completion text, so the string is never written outside the fixture file. Automated secret scanners that flag `mock-llm/responses.json` should treat this as a known, intentional false positive originating from the assignment fixture.

If a key reaches a Git commit, revoke/rotate it immediately at the provider, update the runtime secret store, and verify the replacement works. Remove the exposed value from the entire Git history (for example with `git-filter-repo`), coordinate a force-push with collaborators, and ask downstream clones to re-clone or clean their histories. History rewriting does not make the old key safe, which is why rotation comes first. Add pre-commit checks and repository secret scanning, and review any logs or artifacts that may also contain the value.

## Result data retention and protection

EOB results may contain sensitive member and claim information. Treat both input documents and generated results as sensitive data. The assignment's local `results/*.json` artifacts are retained for review and should be deleted when the assignment no longer needs them. The application does not implement automatic deletion. For a deployment, set and document a retention period with the data owner and applicable obligations; as an operational starting point, retain service-generated results for no longer than 30 days unless a documented business or legal requirement requires a different period. Run a scheduled cleanup that removes expired result files and temporary files, and include retained backups and replicas in the same lifecycle. Do not rely on overwriting files as secure erasure on SSDs or managed storage; use the storage provider's deletion and lifecycle controls.

On POSIX systems, result files are created with owner-only read/write permissions (`0600`). The results directory inherits the process umask and parent-directory permissions; provision it with owner-only access (`0700`) and run the service under a dedicated OS account. Node's `mode` setting does not establish Windows ACLs, so configure equivalent restrictive ACLs explicitly on Windows. Keep results on an encrypted, access-controlled volume, restrict backups to authorized operators, and avoid placing production results in synced desktop folders or public web roots. For deployment, prefer a private persistent volume with encryption at rest, least-privilege access, monitored capacity, and a documented backup and deletion policy. The current file repository is intended for a single service instance; use a transactional database or protected object store with access controls and lifecycle policies when deployment requirements exceed that scope.

## Assignment checklist

- [x] Express `POST /extract` supports `documentId` and `text`.
- [x] Reads text from `samples/` and calls a model through the `extract(documentText)` adapter interface.
- [x] Strictly validates the requested header and line-item fields; coerces supported money formats; flags and strips unexpected fields.
- [x] Handles markdown/prose wrappers, trailing commas, malformed JSON, wrong types, bounded repair/retry, and clean errors without stack traces.
- [x] Independently reconciles each line's allowed-minus-paid amount exactly and line totals against `declared_total` with one-cent tolerance.
- [x] Preserves returned amounts on mismatch; sets `is_arithmetic_valid`, `needs_review`, and `review_reasons` appropriately.
- [x] Uses exact integer cents internally and exact decimal strings in JSON; absent values remain null rather than guessed.
- [x] Handles provider timeouts, bounded retries with exponential backoff, idempotent replays, and atomic result writes without partial records.
- [x] Reads credentials from environment variables, includes a secret-free `.env.example`, and documents rotation/history cleanup.
- [x] Logs only a generated request ID, pseudonymized document ID, latency, outcome, and timestamp; never logs documents, member fields, or secrets.
- [x] Includes unit and HTTP tests for validation and failure paths (`npm test`).
- [x] Produces one result file per supplied sample named after the sample (`npm run samples`).
- [x] Documents a clean-clone install and run path (`npm ci`, then `npm run demo`).
- [ ] Publish/share the GitHub repository and record the Loom demo; these require external actions after local implementation.
