const fetch = require('node-fetch');
const { UpstreamServiceError, NotConfiguredError } = require('../utils/errors');
const logger = require('../utils/logger');

const PROVIDER = (process.env.LLM_PROVIDER || 'none').toLowerCase();

function isLlmEnabled() {
  if (PROVIDER === 'openrouter') return Boolean(process.env.OPENROUTER_API_KEY);
  return false;
}

/**
 * Extract a JSON object from a model response, tolerating markdown code
 * fences or surrounding prose (defensive - we still validate with zod after).
 */
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('No JSON object found in model response');
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

async function callOpenRouter(systemPrompt, userPrompt) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || 'openrouter/auto';

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      // Optional but recommended by OpenRouter for analytics/rate limits
      ...(process.env.OPENROUTER_SITE_URL && {
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL,
      }),
      ...(process.env.OPENROUTER_APP_NAME && {
        'X-Title': process.env.OPENROUTER_APP_NAME,
      }),
    },
    body: JSON.stringify({
      model,
      max_tokens: 600,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new UpstreamServiceError(`OpenRouter API error (${response.status})`, body);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new UpstreamServiceError('OpenRouter response contained no content');
  return content;
}

/**
 * Send a system+user prompt to whichever provider is configured and return
 * a parsed JSON object. Throws NotConfiguredError if no provider is set up,
 * and UpstreamServiceError on network/API/parse failures.
 */
async function generateJson({ systemPrompt, userPrompt }) {
  if (!isLlmEnabled()) {
    throw new NotConfiguredError(
      `LLM provider not configured (LLM_PROVIDER=${PROVIDER}). Set LLM_PROVIDER=openrouter and OPENROUTER_API_KEY to enable AI generation.`
    );
  }

  let raw;
  try {
    if (PROVIDER === 'openrouter') {
      raw = await callOpenRouter(systemPrompt, userPrompt);
    } else {
      throw new NotConfiguredError(`Unsupported LLM_PROVIDER "${PROVIDER}"`);
    }
  } catch (err) {
    if (err instanceof UpstreamServiceError || err instanceof NotConfiguredError) throw err;
    throw new UpstreamServiceError('Failed to reach LLM provider', String(err));
  }

  try {
    return extractJson(raw);
  } catch (err) {
    logger.warn('LLM returned non-JSON content', { raw });
    throw new UpstreamServiceError('LLM response was not valid JSON', String(err));
  }
}

module.exports = { generateJson, isLlmEnabled, PROVIDER };