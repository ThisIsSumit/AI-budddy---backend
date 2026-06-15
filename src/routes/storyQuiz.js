const express = require('express');
const { getStoryQuiz } = require('../controllers/story-quiz');

const router = express.Router();

// GET /api/story-quiz - returns { story, quiz, storySource, quizSource } as one pair.
router.get('/', getStoryQuiz);

module.exports = router;