const { generateStory } = require('../services/storyService');
const { generateQuiz } = require('../services/quizService');

/**
 * GET /api/story-quiz
 *
 * Returns a single { story, quiz } pair so the frontend always renders a
 * matching story + question together, e.g.:
 * {
 *   "story": "Once upon a time, a clever little robot named Pip ...",
 *   "quiz": {
 *     "question": "What colour was Pip's gear?",
 *     "options": ["Red", "Green", "Blue", "Yellow"],
 *     "answer": "Blue"
 *   },
 *   "storySource": "ai" | "template" | "default",
 *   "quizSource": "ai" | "heuristic" | "default"
 * }
 *
 * Reuses generateStory()/generateQuiz() so AI generation, schema
 * validation (StorySchema/QuizSchema), and fallback pipelines (template /
 * heuristic / default) all work exactly as they do for the standalone
 * /api/story and /api/quiz endpoints - just composed into one response.
 *
 * Tapping "Next" on the frontend simply calls this endpoint again, which
 * generates a brand new story and a quiz based on that new story's text.
 */
async function getStoryQuiz(req, res) {
  // Optional query params let callers customise the story, same as
  // POST /api/story/generate (e.g. /api/story-quiz?buddyName=Pip&numOptions=4)
  const { numOptions, ...storyParams } = req.query;

  const { story, source: storySource } = await generateStory(storyParams);
  const { quiz, source: quizSource } = await generateQuiz(
    story.text,
    numOptions ? Number(numOptions) : 4
  );

  res.json({
    story: story.text,
    quiz,
    storySource,
    quizSource,
  });
}

module.exports = { getStoryQuiz };