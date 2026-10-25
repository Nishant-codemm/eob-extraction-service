'use strict';

class AppError extends Error {
  constructor(message, { code, statusCode = 500, retryable = false, cause } = {}) {
    super(message, { cause });
    this.name = this.constructor.name;
    this.code = code || 'INTERNAL_ERROR';
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}

class RequestValidationError extends AppError {
  constructor(message = 'Request body is invalid') {
    super(message, { code: 'INVALID_REQUEST', statusCode: 400 });
  }
}

class DocumentNotFoundError extends AppError {
  constructor() {
    super('Document was not found', { code: 'DOCUMENT_NOT_FOUND', statusCode: 404 });
  }
}

class ModelCallError extends AppError {
  constructor(message = 'Model provider request failed', { retryable = false, cause } = {}) {
    super(message, { code: 'MODEL_CALL_FAILED', statusCode: 502, retryable, cause });
  }
}

class ModelTimeoutError extends AppError {
  constructor() {
    super('Model provider request timed out', { code: 'MODEL_TIMEOUT', statusCode: 504, retryable: true });
  }
}

class InvalidModelOutputError extends AppError {
  constructor() {
    super('Model response could not be validated', { code: 'INVALID_MODEL_OUTPUT', statusCode: 502 });
  }
}

class PersistenceError extends AppError {
  constructor(cause) {
    super('Result could not be persisted', { code: 'PERSISTENCE_FAILED', statusCode: 500, cause });
  }
}

module.exports = {
  AppError,
  DocumentNotFoundError,
  InvalidModelOutputError,
  ModelCallError,
  ModelTimeoutError,
  PersistenceError,
  RequestValidationError,
};
