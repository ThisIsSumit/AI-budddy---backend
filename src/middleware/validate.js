const { ValidationError } = require('../utils/errors');

/**
 * Returns Express middleware that validates+coerces req.body against a Zod
 * schema, replacing req.body with the parsed (defaulted) result.
 */
function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      return next(
        new ValidationError('Request body failed validation', result.error.flatten())
      );
    }
    req.body = result.data;
    next();
  };
}

module.exports = { validateBody };
