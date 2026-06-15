/**
 * Static defaults used as:
 *  - the response for GET /api/story and GET /api/quiz
 *  - the safety-net fallback when AI generation is disabled or fails
 *
 * Keeping these as plain data (not baked into route logic) means the
 * "data-driven" contract with the Flutter client is identical whether the
 * content came from the LLM or from here.
 */

const DEFAULT_STORY = {
  id: 'pip-whispering-woods',
  title: "Pip and the Whispering Woods",
  text:
    "Once upon a time, a clever little robot named Pip lost his shiny blue gear in the Whispering Woods...",
};

const DEFAULT_QUIZ = {
  question: "What colour was Pip the Robot's lost gear?",
  options: ['Red', 'Green', 'Blue', 'Yellow'],
  answer: 'Blue',
};

// A couple of extra hand-written quizzes so /api/quiz/random and the
// generation fallback have some variety even with LLM_PROVIDER=none.
const SAMPLE_QUIZZES = [
  DEFAULT_QUIZ,
  {
    question: 'Where did Pip lose his gear?',
    options: ['The Whispering Woods', 'A volcano', 'The ocean', 'Outer space', 'A library'],
    answer: 'The Whispering Woods',
  },
  {
    question: 'What is Pip?',
    options: ['A robot', 'A dragon', 'A fish'],
    answer: 'A robot',
  },
];

module.exports = { DEFAULT_STORY, DEFAULT_QUIZ, SAMPLE_QUIZZES };
