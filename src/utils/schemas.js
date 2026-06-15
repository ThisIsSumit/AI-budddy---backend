const { z } = require('zod');

/**
 * Shape returned by both /api/quiz and /api/quiz/generate.
 * This is the contract the Flutter QuizModel.fromJson relies on:
 *   { question: string, options: string[3-5], answer: string }
 * `answer` MUST be one of the strings in `options`.
 */
const QuizSchema = z
  .object({
    question: z.string().min(3).max(200),
    options: z.array(z.string().min(1).max(60)).min(3).max(5),
    answer: z.string().min(1).max(60),
  })
  .refine((data) => data.options.includes(data.answer), {
    message: 'answer must be one of the provided options',
    path: ['answer'],
  })
  .refine((data) => new Set(data.options).size === data.options.length, {
    message: 'options must be unique',
    path: ['options'],
  });

/**
 * Shape returned by /api/story and /api/story/generate.
 */
const StorySchema = z.object({
  id: z.string().min(1).max(80).optional(),
  title: z.string().min(1).max(120),
  text: z.string().min(20).max(2000),
});

/**
 * Request body for POST /api/story/generate
 */
const StoryGenerateRequestSchema = z.object({
  childName: z.string().min(1).max(40).optional(),
  buddyName: z.string().min(1).max(40).optional().default('Pip'),
  theme: z.string().min(1).max(80).optional(),
  lostItem: z.string().min(1).max(60).optional(),
  setting: z.string().min(1).max(80).optional(),
  ageRange: z.string().min(1).max(20).optional().default('4-8'),
});

/**
 * Request body for POST /api/quiz/generate
 */
const QuizGenerateRequestSchema = z.object({
  storyText: z.string().min(10).max(4000),
  numOptions: z.number().int().min(3).max(5).optional().default(4),
});

/**
 * Request body for POST /api/tts
 */
const TtsRequestSchema = z.object({
  text: z.string().min(1).max(2000),
  voiceId: z.string().min(1).max(100).optional(),
});

module.exports = {
  QuizSchema,
  StorySchema,
  StoryGenerateRequestSchema,
  QuizGenerateRequestSchema,
  TtsRequestSchema,
};
