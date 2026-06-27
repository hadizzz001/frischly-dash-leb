const express = require("express");
const router = express.Router();
const { translate } = require("../controllers/translateController");

// POST /api/translate  { q: string[], target: "ar", source?: "en" }
router.post("/", translate);

module.exports = router;
