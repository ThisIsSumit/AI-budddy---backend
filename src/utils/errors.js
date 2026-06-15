class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

class UpstreamServiceError extends AppError {
  constructor(message, details) {
    super(message, 502, 'UPSTREAM_SERVICE_ERROR', details);
  }
}

class NotConfiguredError extends AppError {
  constructor(message, details) {
    super(message, 501, 'NOT_CONFIGURED', details);
  }
}

module.exports = { AppError, ValidationError, UpstreamServiceError, NotConfiguredError };
