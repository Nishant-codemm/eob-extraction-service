# EOB Extraction Service

A Node.js and Express service that extracts structured JSON from Explanation of Benefits (EOB) documents. The service treats language model output as untrusted input, validates it at runtime, independently reconciles arithmetic, and flags uncertain results for manual review instead of silently modifying data.

## 🚀 Quick Start

Requires **Node.js 22+** and **npm**.

```bash
npm ci
npm test
npm run demo
```

`npm run demo` processes the five supplied sample documents, writes the generated JSON files into the `results/` directory, and starts the Express API.

The extraction endpoint is:

```http
POST /extract
```

Example request:

```json
{
  "documentId": "01_eob_northwind"
}
```

The API also accepts raw document text using:

```json
{
  "text": "..."
}
```

---

## 🏗️ Design Highlights

- Runtime schema validation using **Zod**
- Defensive JSON parsing for markdown wrappers and malformed responses
- Money calculations performed using **BigInt** minor units (integer cents)
- Independent arithmetic reconciliation
- Original model values are **never modified** when reconciliation fails
- Atomic result persistence to avoid partial writes
- Idempotent processing for repeated requests
- Bounded retries with exponential backoff for transient failures

---

## ⚠️ Failure Handling

| Scenario | Behaviour |
|----------|-----------|
| Invalid request | Returns safe **400 Bad Request** |
| Unknown document | Returns **404 Not Found** |
| Malformed model output | Validation + bounded retry |
| Provider timeout | Retry with exponential backoff |
| Arithmetic mismatch | Preserve values, set `needs_review=true` |

---

## 🔐 Security

- Secrets are loaded through `.env`
- `.env.example` documents required configuration
- No secrets are committed to Git
- Logs never contain document text, patient information or credentials

> **Assignment Note:** The `mock-llm/responses.json` fixture contains a synthetic `OPENAI_API_KEY=sk-live-...` string supplied in the original starter bundle. It is a deliberate test vector and is never logged, persisted or forwarded by the application.

---

## ✅ Assignment Deliverables

- Express `POST /extract` endpoint
- Runtime schema validation
- Arithmetic reconciliation
- Manual review flags
- Automated tests
- Sample result files
- Atomic persistence
- Environment-based configuration
- README and Loom walkthrough
