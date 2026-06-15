'use strict';

const fetch = require('node-fetch');
const { UpstreamServiceError, NotConfiguredError } = require('../utils/errors');
const logger = require('../utils/logger');

const PROVIDER = (process.env.LLM_PROVIDER || 'none').toLowerCase();

function isLlmEnabled() {
  if (PROVIDER === 'openrouter') return Boolean(process.env.OPENROUTER_API_KEY);
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON extraction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Robustly extracts a JSON object from a model response that may:
 *   - be wrapped in ```json ... ``` fences
 *   - have leading/trailing prose
 *   - be TRUNCATED (most common failure mode when max_tokens is too low)
 *
 * Strategy:
 *   1. Strip fences if present
 *   2. Find the opening `{`
 *   3. Walk forward tracking brace depth, collecting characters
 *   4. Stop at the first balanced `}` — gives us the largest complete object
 *      even if the model appended garbage after it
 *   5. If still unbalanced (truncation), attempt a recovery pass that closes
 *      open string literals and braces before parsing
 */
function extractJson(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('extractJson received empty/non-string input');
  }

  // Step 1 — strip markdown fences
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/is);
  const source = fenced ? fenced[1].trim() : text.trim();

  // Step 2 — find opening brace
  const start = source.indexOf('{');
  if (start === -1) {
    throw new Error(`No JSON object found. Raw (first 200 chars): ${source.slice(0, 200)}`);
  }

  // Step 3 & 4 — walk character-by-character tracking depth
  let depth        = 0;
  let inString     = false;
  let escapeNext   = false;
  let end          = -1;

  for (let i = start; i < source.length; i++) {
    const ch = source[i];

    if (escapeNext) { escapeNext = false; continue; }
    if (ch === '\\' && inString) { escapeNext = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }

  // Step 5a — happy path: found a balanced object
  if (end !== -1) {
    const slice = source.slice(start, end + 1);
    try {
      return JSON.parse(slice);
    } catch (err) {
      throw new Error(`Balanced JSON found but failed to parse: ${err.message}. Slice: ${slice.slice(0, 300)}`);
    }
  }

  // Step 5b — truncation recovery: object is unbalanced (cut off by token limit)
  logger.warn('LLM response appears truncated — attempting JSON recovery', {
    rawLength: text.length,
    depth,
    inString,
  });

  const partial = source.slice(start);
  const recovered = repairTruncatedJson(partial);
  try {
    return JSON.parse(recovered);
  } catch (err) {
    throw new Error(
      `JSON recovery failed: ${err.message}. ` +
      `Original raw (200 chars): ${text.slice(0, 200)}`
    );
  }
}

/**
 * Best-effort repair of a truncated JSON object string.
 *
 * Handles the two most common LLM truncation patterns:
 *   - Cut off mid-string value:  {"title": "The Robot's Blue
 *   - Cut off after a comma:     {"title": "Foo", "text":
 *
 * Returns a string that JSON.parse can consume (field values may be empty
 * strings / null for truncated fields, which Zod validation will catch and
 * the fallback pipeline will recover from).
 */
function repairTruncatedJson(partial) {
  let s = partial;

  // Close any open string (cut off mid-value)
  const quoteCount = (s.match(/(?<!\\)"/g) || []).length;
  if (quoteCount % 2 !== 0) s += '"';

  // Remove trailing incomplete key or comma
  s = s.replace(/,\s*$/, '');            // trailing comma
  s = s.replace(/,\s*"[^"]*"?\s*:\s*$/, ''); // trailing partial key: value

  // Close open braces
  const openBraces  = (s.match(/{/g) || []).length;
  const closeBraces = (s.match(/}/g) || []).length;
  s += '}'.repeat(Math.max(0, openBraces - closeBraces));

  return s;
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenRouter caller
// ─────────────────────────────────────────────────────────────────────────────

async function callOpenRouter(systemPrompt, userPrompt) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model  = process.env.OPENROUTER_MODEL || 'openrouter/auto';

  // max_tokens bumped from 600 → 1024 so story+quiz JSON never gets truncated.
  // Story JSON is ~200 tokens, quiz JSON ~150 tokens, so 1024 gives 4× headroom.
  const MAX_TOKENS = parseInt(process.env.LLM_MAX_TOKENS || '1024', 10);

  // Build request body. We request json_object format but some OpenRouter
  // models ignore it, so our extractJson handles the prose-wrapped case too.
  const body = {
    model,
    max_tokens: MAX_TOKENS,
    temperature: 0.7,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt   },
    ],
  };

  // Only pass response_format if the model is known to support it.
  // Unsupported models silently ignore it (or error), so we guard with an env flag.
  const supportsJsonMode = (process.env.OPENROUTER_JSON_MODE || 'true') === 'true';
  if (supportsJsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const TIMEOUT_MS = parseInt(process.env.LLM_TIMEOUT_MS || '15000', 10);

  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type':  'application/json',
        Authorization:   `Bearer ${apiKey}`,
        ...(process.env.OPENROUTER_SITE_URL && { 'HTTP-Referer': process.env.OPENROUTER_SITE_URL }),
        ...(process.env.OPENROUTER_APP_NAME && { 'X-Title':      process.env.OPENROUTER_APP_NAME }),
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new UpstreamServiceError(`OpenRouter request timed out after ${TIMEOUT_MS}ms`);
    }
    throw new UpstreamServiceError('Network error reaching OpenRouter', String(err));
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new UpstreamServiceError(
      `OpenRouter API error (HTTP ${response.status})`,
      errBody.slice(0, 400)
    );
  }

  const data = await response.json();

  // Log usage so we can tune max_tokens without guessing
  if (data.usage) {
    logger.debug('OpenRouter token usage', {
      model:             data.model,
      prompt_tokens:     data.usage.prompt_tokens,
      completion_tokens: data.usage.completion_tokens,
      finish_reason:     data.choices?.[0]?.finish_reason,
    });

    // Warn if the model stopped because it hit the token limit (finish_reason === 'length')
    // rather than naturally completing — this is exactly what causes truncated JSON.
    if (data.choices?.[0]?.finish_reason === 'length') {
      logger.warn('OpenRouter completion stopped at token limit — response may be truncated', {
        completion_tokens: data.usage.completion_tokens,
        max_tokens:        MAX_TOKENS,
        hint:              'Raise LLM_MAX_TOKENS or shorten your prompt',
      });
    }
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new UpstreamServiceError('OpenRouter response contained no content', JSON.stringify(data).slice(0, 300));
  }
  return content;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send a system+user prompt pair to the configured LLM provider and return
 * a parsed JSON object.
 *
 * Throws:
 *   NotConfiguredError  — provider/key not set up
 *   UpstreamServiceError — network, auth, or JSON-parse failure
 *
 * Never returns undefined; always throws on failure so callers can fall back.
 */
async function generateJson({ systemPrompt, userPrompt }) {
  if (!isLlmEnabled()) {
    throw new NotConfiguredError(
      `LLM provider not configured (LLM_PROVIDER=${PROVIDER}). ` +
      `Set LLM_PROVIDER=openrouter and OPENROUTER_API_KEY to enable AI generation.`
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
    throw new UpstreamServiceError('Unexpected error calling LLM provider', String(err));
  }

  try {
    return extractJson(raw);
  } catch (err) {
    // Log the full raw response so devs can see exactly what the model returned
    logger.warn('Failed to extract JSON from LLM response', {
      error:         err.message,
      rawLength:     raw?.length,
      rawPreview:    raw?.slice(0, 300),
    });
    throw new UpstreamServiceError('LLM response was not valid JSON', err.message);
  }
}

module.exports = { generateJson, isLlmEnabled, PROVIDER };