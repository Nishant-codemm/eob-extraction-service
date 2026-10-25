'use strict';

const express = require('express');
const { randomUUID, randomBytes, createHmac } = require('node:crypto');
const { extractRequestSchema } = require('./request-schema');
const { AppError, RequestValidationError } = require('../errors');

function createApp({ extractionService, logger, logIdHmacKey }) {
  const effectiveLogKey = logIdHmacKey || process.env.LOG_ID_HMAC_KEY || randomBytes(32).toString('hex');
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    const startedAt = process.hrtime.bigint();
    res.setHeader('x-request-id', req.requestId);
    res.on('finish', () => {
      const body = req.body;
      const rawDocumentId = typeof body?.documentId === 'string'
        ? body.documentId
        : typeof body?.text === 'string' ? body.text : null;
      const documentId = rawDocumentId === null
        ? null
        : createHmac('sha256', effectiveLogKey).update(rawDocumentId).digest('hex').slice(0, 24);
      const outcome = res.statusCode >= 500
        ? 'error'
        : res.statusCode >= 400
          ? 'rejected'
          : res.locals.outcome || 'success';
      logger.info({
        requestId: req.requestId,
        documentId,
        latencyMs: Number(process.hrtime.bigint() - startedAt) / 1_000_000,
        outcome,
      }, 'request completed');
    });
    next();
  });

  app.use(express.json({ limit: '600kb', strict: true }));

  app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));

  app.post('/extract', async (req, res, next) => {
    try {
      const parsed = extractRequestSchema.safeParse(req.body);
      if (!parsed.success) throw new RequestValidationError();
      const { result, cached } = await extractionService.extractRequest(parsed.data);
      res.locals.outcome = result.header.needs_review ? 'needs_review' : cached ? 'idempotent_replay' : 'success';
      res.status(200).json({ ...result, idempotent_replay: cached });
    } catch (error) {
      next(error);
    }
  });

  app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error);
    if (error?.type === 'entity.too.large') {
      return res.status(413).json({ error: { code: 'REQUEST_TOO_LARGE', message: 'Request body is too large' } });
    }
    if (error?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON' } });
    }

    const appError = error instanceof AppError ? error : new AppError('Internal server error');
    return res.status(appError.statusCode).json({
      error: { code: appError.code, message: appError.message },
    });
  });

  return app;
}

module.exports = { createApp };
