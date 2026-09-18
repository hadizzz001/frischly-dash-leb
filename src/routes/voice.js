const express = require("express");
const multer = require("multer");
const { interpretVoice } = require("../controllers/voiceController");

const router = express.Router();

// The clip is held in memory only for the duration of the request (never
// written to disk). 60s of m4a at the app's recording preset is ~1MB, so a
// 10MB cap is generous; multer answers 413-style "too_large" beyond it.
const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

// POST /api/voice/interpret  multipart { audio: <file> }
router.post("/interpret", (req, res, next) => {
	upload.single("audio")(req, res, (err) => {
		if (err) {
			const tooLarge = err.code === "LIMIT_FILE_SIZE";
			return res.status(tooLarge ? 413 : 400).json({
				success: false,
				message: tooLarge ? "too_large" : "no_audio",
			});
		}
		return next();
	});
}, interpretVoice);

module.exports = router;
