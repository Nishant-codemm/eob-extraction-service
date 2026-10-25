'use strict';

const { z } = require('zod');
require('dotenv').config({ quiet: true });

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  MODEL_ADAPTER: z.enum(['mock', 'openai-compatible']).default('mock'),
  LLM_API_URL: z.string().url().optional().or(z.literal('')),
  LLM_API_KEY: z.string().optional().or(z.literal('')),
  LLM_MODEL: z.string().trim().min(1).optional().or(z.literal('')),
  LOG_ID_HMAC_KEY: z.string().min(32).optional().or(z.literal('')),
  MODEL_TIMEOUT_MS: z.coerce.number().int().min(50).max(120_000).default(5_000),
  MAX_RETRIES: z.coerce.number().int().min(0).max(3).default(2),
  RETRY_BASE_DELAY_MS: z.coerce.number().int().min(0).max(10_000).default(100),
  RESULTS_DIR: z.string().trim().min(1).default('results'),
});

function loadConfig(env = process.env) {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) throw new Error('Application configuration is invalid');
  const value = parsed.data;
  if (value.MODEL_ADAPTER === 'openai-compatible' && (!value.LLM_API_URL || !value.LLM_API_KEY || !value.LLM_MODEL)) {
    throw new Error('OpenAI-compatible adapter requires LLM_API_URL, LLM_API_KEY, and LLM_MODEL');
  }
  if (value.NODE_ENV === 'production' && !value.LOG_ID_HMAC_KEY) {
    throw new Error('Production configuration requires LOG_ID_HMAC_KEY');
  }
  return {
    environment: value.NODE_ENV,
    port: value.PORT,
    modelAdapter: value.MODEL_ADAPTER,
    llmApiUrl: value.LLM_API_URL || null,
    llmApiKey: value.LLM_API_KEY || null,
    llmModel: value.LLM_MODEL || null,
    logIdHmacKey: value.LOG_ID_HMAC_KEY || null,
    modelTimeoutMs: value.MODEL_TIMEOUT_MS,
    maxRetries: value.MAX_RETRIES,
    retryBaseDelayMs: value.RETRY_BASE_DELAY_MS,
    resultsDir: value.RESULTS_DIR,
  };
}

module.exports = { loadConfig };
