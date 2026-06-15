const express = require('express');
const { getHealth } = require('../controllers/healthController');

const storyQuizRoutes = require('./storyQuiz');


const router = express.Router();

router.get('/health', getHealth);
router.use('/story-quiz', storyQuizRoutes);


module.exports = router;
