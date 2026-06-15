const llm = require('../services/llmService');


/** GET /api/health - reports server status + which AI pipelines are active. */
function getHealth(req, res) {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    pipelines: {
      llm: { provider: llm.PROVIDER, enabled: llm.isLlmEnabled() },
    },
  });
}

module.exports = { getHealth };
