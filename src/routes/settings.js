const express = require('express');
const { getPublicSettings } = require('../controllers/settingController');

const router = express.Router();

// Public settings route
router.get('/public', getPublicSettings);

module.exports = router;
