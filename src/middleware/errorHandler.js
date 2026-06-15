const { AppError } = require('../utils/errors');
const logger = require('../utils/logger');

/* Wrap async route handlers so rejected promises reach the error handler. */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/* 404 handler - placed after all routes. */
function notFoundHandler(req, res) {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.originalUrl}` },
  });
}

/* Centralised error handler - placed last. Always returns JSON, never leaks stack traces. */
function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error(err.message, { code: err.code, details: err.details, path: req.originalUrl });
    } else {
      logger.warn(err.message, { code: err.code, details: err.details, path: req.originalUrl });
    }
    return res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  logger.error(err.message || 'Unhandled error', { stack: err.stack, path: req.originalUrl });
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our end.' },
  });
}

module.exports = { asyncHandler, notFoundHandler, errorHandler };
