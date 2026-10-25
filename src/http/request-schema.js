'use strict';

const { z } = require('zod');

const extractRequestSchema = z.strictObject({
  documentId: z.string().trim().min(1).max(128).optional(),
  text: z.string().trim().min(1).max(500_000).optional(),
}).refine((value) => Number(Boolean(value.documentId)) + Number(Boolean(value.text)) === 1, {
  message: 'Provide exactly one of documentId or text',
});

module.exports = { extractRequestSchema };
