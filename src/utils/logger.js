/* Minimal structured logger - avoids pulling in a heavy dependency. */

const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = levels[process.env.LOG_LEVEL] ?? levels.info;

function log(level, message, meta) {
  if (levels[level] > currentLevel) return;
  const entry = {
    time: new Date().toISOString(),
    level,
    message,
    ...(meta ? { meta } : {}),
  };
  // eslint-disable-next-line no-console
  console[level === 'debug' ? 'log' : level === 'error' ? 'error' : 'log'](
    JSON.stringify(entry)
  );
}

module.exports = {
  error: (msg, meta) => log('error', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  info: (msg, meta) => log('info', msg, meta),
  debug: (msg, meta) => log('debug', msg, meta),
};
