const llm = require('./llmService');
const { StorySchema } = require('../utils/schemas');
const { DEFAULT_STORY } = require('../data/defaults');
const logger = require('../utils/logger');

const SYSTEM_PROMPT = `You are a children's story writer for an app called "AI Story Buddy".
Audience: children aged 4-10. Tone: joyful, warm, curious, gentle - never scary.
Always respond with ONLY a JSON object of the form:
{"title": "string", "text": "string"}
"text" must be 2-4 short sentences (max ~80 words), simple vocabulary, present a tiny
problem or adventure, and end on an inviting note (it can trail off with "...").
Do not include markdown, comments, or any text outside the JSON object.`;

function buildUserPrompt(params) {
  const { childName, buddyName, theme, lostItem, setting, ageRange } = params;
  const parts = [
    `Write a short bedtime-style story for a child${childName ? ` named ${childName}` : ''} (age range ${ageRange}).`,
    `The main character is a friendly robot named ${buddyName}.`,
  ];
  if (lostItem) parts.push(`${buddyName} loses or is looking for: ${lostItem}.`);
  if (setting) parts.push(`The story takes place in/at: ${setting}.`);
  if (theme) parts.push(`Theme/mood: ${theme}.`);
  parts.push('Mention at least one clear, simple, kid-friendly fact that could become a quiz question (e.g. a colour, a number, or a place).');
  return parts.join(' ');
}

/* ---------------------------------------------------------------------- */
/* Template fallback - deterministic, no network/AI required.              */
/* ---------------------------------------------------------------------- */

const COLORS = ['blue', 'red', 'green', 'yellow', 'purple', 'orange'];
const SETTINGS = ['Whispering Woods', 'Crystal Caves', 'Sunflower Meadow', 'Starlight Harbor'];
const ITEMS = ['gear', 'lantern', 'compass', 'scarf', 'key'];

function pick(arr, seedStr) {
  // Simple deterministic-ish pick based on input so repeated calls with the
  // same params feel stable, but different params/time vary the result.
  const seed = [...(seedStr || '')].reduce((a, c) => a + c.charCodeAt(0), 0) + Date.now() % 7;
  return arr[seed % arr.length];
}

function templateStory(params) {
  const buddyName = params.buddyName || 'Pip';
  const color = pick(COLORS, params.theme || params.lostItem || buddyName);
  const setting = params.setting || pick(SETTINGS, buddyName + color);
  const item = params.lostItem || pick(ITEMS, color + setting);

  const text =
    `Once upon a time, a clever little robot named ${buddyName} lost ${article(color)} ${color} ` +
    `${item} in the ${setting}. ${buddyName} took a deep breath, gave a little wiggle, and set off ` +
    `to find it - peeking under mushrooms and behind sparkling rocks along the way...`;

  return {
    id: `${buddyName.toLowerCase()}-${setting.toLowerCase().replace(/\s+/g, '-')}`,
    title: `${buddyName} and the ${setting}`,
    text,
  };
}

function article(word) {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

/* ---------------------------------------------------------------------- */

/**
 * Generate a story. Tries the configured LLM first (if any); on any
 * failure (including no provider configured) falls back to a template
 * generator so the endpoint always returns a valid, schema-conformant story.
 *
 * Returns { story, source } where source is "ai" | "template" | "default".
 */
async function generateStory(params = {}) {
  if (llm.isLlmEnabled()) {
    try {
      const json = await llm.generateJson({
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: buildUserPrompt(params),
      });
      const story = StorySchema.parse(json);
      return { story, source: 'ai' };
    } catch (err) {
      logger.warn('AI story generation failed, falling back to template', {
        error: err.message,
      });
    }
  }

  try {
    const story = StorySchema.parse(templateStory(params));
    return { story, source: 'template' };
  } catch (err) {
    logger.error('Template story failed schema validation, using default', {
      error: err.message,
    });
    return { story: DEFAULT_STORY, source: 'default' };
  }
}

module.exports = { generateStory };
