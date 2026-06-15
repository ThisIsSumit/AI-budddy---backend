const llm = require('./llmService');
const { QuizSchema } = require('../utils/schemas');
const { DEFAULT_QUIZ } = require('../data/defaults');
const logger = require('../utils/logger');

const SYSTEM_PROMPT = `You are a quiz writer for a children's reading app called "AI Story Buddy".
Given a short story, write ONE multiple-choice comprehension question for a child
aged 4-10, based on a concrete detail in the story (a colour, name, place, or number).
Always respond with ONLY a JSON object of this exact shape:
{"question": "string", "options": ["string", ...], "answer": "string"}
Rules:
- "options" must contain between 3 and 5 short strings (1-3 words each).
- Exactly one of "options" must equal "answer" (character-for-character).
- Keep language simple and friendly. No markdown, no extra text.`;

function buildUserPrompt(storyText, numOptions) {
  return `Story: """${storyText}"""\n\nWrite the quiz JSON with exactly ${numOptions} options.`;
}

/* ---------------------------------------------------------------------- */
/* Heuristic fallback - scans the story text for a known category of word  */
/* and builds a quiz around it without any AI call.                        */
/* ---------------------------------------------------------------------- */

const CATEGORIES = [
  {
    label: 'colour',
    question: (subject) => `What colour was ${subject}'s gear?`,
    pool: ['Red', 'Green', 'Blue', 'Yellow', 'Purple', 'Orange', 'Pink'],
  },
  {
    label: 'place',
    question: () => 'Where did the story take place?',
    pool: [
      'The Whispering Woods',
      'Crystal Caves',
      'Sunflower Meadow',
      'Starlight Harbor',
      'A spaceship',
    ],
  },
];

function findSubjectName(storyText) {
  // Looks for a capitalised word following common naming patterns like
  // "robot named X" or "named X". Falls back to "Pip".
  const match = storyText.match(/named\s+([A-Z][a-zA-Z]*)/);
  return match ? match[1] : 'Pip';
}

function buildHeuristicQuiz(storyText, numOptions = 4) {
  const lower = storyText.toLowerCase();
  const subject = findSubjectName(storyText);

  for (const category of CATEGORIES) {
    const found = category.pool.find((opt) => lower.includes(opt.toLowerCase()));
    if (!found) continue;

    const distractors = category.pool.filter((opt) => opt !== found);
    shuffle(distractors);

    const options = [found, ...distractors.slice(0, Math.max(2, numOptions - 1))];
    shuffle(options);

    return {
      question: category.question(subject),
      options,
      answer: found,
    };
  }

  // Nothing matched - return the universal default quiz.
  return DEFAULT_QUIZ;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ---------------------------------------------------------------------- */

/**
 * Generate a quiz for the given story text. Tries the configured LLM first;
 * on any failure falls back to a heuristic generator, then to DEFAULT_QUIZ.
 *
 * Returns { quiz, source } where source is "ai" | "heuristic" | "default".
 */
async function generateQuiz(storyText, numOptions = 4) {
  if (llm.isLlmEnabled()) {
    try {
      const json = await llm.generateJson({
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: buildUserPrompt(storyText, numOptions),
      });
      const quiz = QuizSchema.parse(json);
      return { quiz, source: 'ai' };
    } catch (err) {
      logger.warn('AI quiz generation failed, falling back to heuristic', {
        error: err.message,
      });
    }
  }

  try {
    const quiz = QuizSchema.parse(buildHeuristicQuiz(storyText, numOptions));
    return { quiz, source: 'heuristic' };
  } catch (err) {
    logger.error('Heuristic quiz failed schema validation, using default', {
      error: err.message,
    });
    return { quiz: DEFAULT_QUIZ, source: 'default' };
  }
}

module.exports = { generateQuiz };
