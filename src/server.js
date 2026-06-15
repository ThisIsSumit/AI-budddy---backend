require('dotenv').config();

const { createApp } = require('./app');
const logger = require('./utils/logger');
const llm = require('./services/llmService');


const PORT = process.env.PORT || 4000;

const app = createApp();

app.listen(PORT, () => {
  logger.info(`AI Story Buddy backend listening on http://localhost:${PORT}`);
  logger.info('AI pipeline status', {
    llm: { provider: llm.PROVIDER, enabled: llm.isLlmEnabled() },
  });
});
