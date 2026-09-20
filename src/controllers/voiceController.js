/*
 * Voice-search proxy controller.
 * ---------------------------------------------------------------------------
 * The mobile app used to call OpenAI directly with an EXPO_PUBLIC_* key, which
 * ships inside the app bundle — anyone could extract it, and a 401 body could
 * leak it on screen. This proxy keeps OPENAI_API_KEY on the server only. The
 * app uploads the clip here; we transcribe it (speech-to-text) and interpret
 * it (structured shopping intent) and return ONLY the result. Provider error
 * bodies are never forwarded to the client.
 *
 *   POST /api/voice/interpret   multipart/form-data { audio: <file> }
 *      -> { success, data: { transcript, intent, market, items } }
 *
 *   intent  "search"      -> items = English search keywords
 *           "open_market" -> market = the store name the shopper asked for
 *
 * Errors are mapped to a short machine code the app turns into localized copy:
 *   400 no_audio | 413 too_large | 503 not_configured | 502 provider_error
 *   429 rate_limited | 504 timeout
 */
const { sendError, sendResponse } = require("../utils/apiResponse");

// The key may be provided as OPENAI_API_KEY or, as the deployed .env names
// it, CHATAPI. Either works; the first non-empty one wins.
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.CHATAPI || "";
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(
	/\/+$/,
	"",
);
// gpt-4o-transcribe is markedly better than whisper-1 at Lebanese dialect and
// Arabic/English code-switching. Falls back to whisper-1 automatically when the
// account can't use it.
const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-transcribe";
const TRANSCRIBE_FALLBACK_MODEL = "whisper-1";
// gpt-4o-mini answers the interpretation task in a fraction of gpt-4o's time
// with the same accuracy (translation + expansion, not hard reasoning).
const EXTRACT_MODEL = process.env.OPENAI_EXTRACT_MODEL || "gpt-4o-mini";

const TRANSCRIBE_TIMEOUT_MS = 20000;
const EXTRACT_TIMEOUT_MS = 12000;

// Speech-to-text vocabulary bias, sent with EVERY transcription regardless of
// the app's UI language — a shopper browsing in English may still say
// "بدي كيلو بندورة". Priming with both Lebanese and English grocery vocabulary
// is what makes dialect recognition reliable.
const SPEECH_HINT =
	"Supermarket voice shopping in Lebanon. The shopper speaks English, Arabic or " +
	"Lebanese/Levantine dialect, often mixing all three in one sentence. " +
	"Lebanese requests: بدي، بدنا، جيبلي، عطيني، لزمني، ناولني، رح آخد، شو في، شوي، " +
	"كتير، كيلو، نص كيلو، ربطة، علبة، قنينة، كيس. " +
	"Lebanese products: لبنة، لبن، جبنة بيضا، شنكليش، زعتر، زيت زيتون، خبز مرقوق، كعك، " +
	"معمول، برغل، فريكة، عدس، حمص، فول، طحينة، دبس رمان، كزبرة، بقدونس، نعنع، بندورة، " +
	"خيار، باذنجان، كوسا، بطاطا، بصل، ثوم، ليمون حامض، دجاج، لحمة، كفتة، مقانق، سمك، " +
	"بيض، حليب، مي، عصير، غازوز، قهوة، شاي، سكر، ملح، رز، مكرونة، شيبس، شوكولا، " +
	"صابون جلي، كلور، شامبو، حفاضات، مناديل. " +
	"Lebanese dishes: تبولة، فتوش، حمص، مجدرة، ملوخية، كبة، منقوشة، ورق عنب، مقلوبة، شاورما. " +
	"English products: hot dog, sausage, ketchup, mustard, cheese, milk, eggs, bread, " +
	"chicken, beef, rice, pasta, pizza, water, juice, soda, chips, coffee, tea, " +
	"dish soap, detergent, floor cleaner, bleach, sponge, paper towel, shampoo, " +
	"toothpaste, diapers, pen, notebook. " +
	"Or asking to open a store: 'go to', روح على، فوت على، وديني على.";

// Common speech-to-text mishearings of food words -> the intended product.
const MISHEARD_FIXES = [
	[/\bnot bad\b/gi, "hot dog"],
	[/\bhot bog\b/gi, "hot dog"],
	[/\bhot dogs\b/gi, "hot dog"],
	[/\bcatch up\b/gi, "ketchup"],
	[/\bketch up\b/gi, "ketchup"],
	[/\bmayo\b/gi, "mayonnaise"],
];

const SYSTEM_PROMPT =
	"You are the voice-shopping brain for a Lebanese grocery delivery app that " +
	"sells EVERY department: food, drinks, dairy, meat, produce, bakery, frozen, " +
	"pantry, AND non-food — cleaning, household, paper goods, hygiene, personal " +
	"care, baby, pet, office/stationery. It also has partner MARKETS openable by name.\n\n" +
	"LANGUAGES: You natively understand English, Modern Standard Arabic and " +
	"LEBANESE/LEVANTINE spoken dialect, including sentences that mix Arabic, " +
	"English and French. Whatever is spoken, you ALWAYS output ENGLISH keywords.\n" +
	"Lebanese for 'I want / give me': بدي بدنا جيبلي جيب لي عطيني عطينا لزمني ناولني رح آخد إجبلي.\n" +
	"Lebanese for 'go to a store': روح على، فوت على، وديني على، خدني على، افتح.\n" +
	"Quantity/filler words to DROP: كيلو، نص كيلو، ربطة، علبة، قنينة، كيس، شوي، كتير، حبة، دزينة.\n" +
	"Sample translations: لبنة labneh, جبنة بيضا white cheese, خبز مرقوق markouk bread, " +
	"كزبرة coriander, بقدونس parsley, بندورة tomato, باذنجان eggplant, كوسا zucchini, " +
	"بطاطا potato, بصل onion, ليمون حامض lemon, لحمة beef, دجاج chicken, مقانق sausage, " +
	"مي water, غازوز soda, دبس رمان pomegranate molasses, برغل bulgur, طحينة tahini, " +
	"صابون جلي dish soap, كلور bleach, حفاضات diapers.\n\n" +
	'Reply with STRICT JSON only: {"intent":"search"|"open_market","market":string,"items":string[]}\n\n' +
	'"open_market" — they want to GO TO / OPEN / VISIT a named store. Put the name in ' +
	'"market" (Latin letters, transliterate if spoken in Arabic), leave "items" empty.\n\n' +
	'"search" — they want products. Leave "market" empty, fill "items" (max 8, most ' +
	"relevant first):\n" +
	"- Named products -> return them, translated to English.\n" +
	"- A dish/recipe/meal -> its 4-8 key ingredients. Know Lebanese dishes: تبولة، فتوش، " +
	"حمص، فلافل، مجدرة، ملوخية، كبة، منقوشة، ورق عنب، مقلوبة، شاورما، فتة، صيادية، مسخن.\n" +
	"- An occasion (barbecue, breakfast, cleaning the house, back to school) -> the " +
	"products people typically buy for it, from ANY department.\n" +
	"- A single product -> add a few closely related items so the whole section shows " +
	"(e.g. 'hot dog' -> hot dog, sausage, hot dog buns, ketchup, mustard).\n" +
	"- Each item: 1-3 words, lowercase, singular, ENGLISH. Keep brand names. Drop " +
	"quantities, units, price and quality words.\n" +
	"- Fix obvious speech-to-text mishearings to the most likely real product, including " +
	"Arabic words mis-transcribed into English.\n" +
	"- Never refuse a non-food request.\n" +
	'- Nothing shoppable said -> {"intent":"search","market":"","items":[]}.';

const FEW_SHOTS = [
	{ role: "user", content: "بدي كيلو بندورة وخيار وشوي لبنة" },
	{ role: "assistant", content: '{"intent":"search","market":"","items":["tomato","cucumber","labneh"]}' },
	{ role: "user", content: "بدي اعمل تبولة" },
	{
		role: "assistant",
		content:
			'{"intent":"search","market":"","items":["parsley","bulgur","tomato","onion","lemon","olive oil","mint"]}',
	},
	{ role: "user", content: "روح على سبينيس" },
	{ role: "assistant", content: '{"intent":"open_market","market":"Spinneys","items":[]}' },
	{ role: "user", content: "جيبلي chips و شوكولا ومي" },
	{ role: "assistant", content: '{"intent":"search","market":"","items":["chips","chocolate","water"]}' },
	{ role: "user", content: "I need cleaning stuff for the kitchen" },
	{
		role: "assistant",
		content:
			'{"intent":"search","market":"","items":["dish soap","floor cleaner","sponge","paper towel","surface cleaner","garbage bags"]}',
	},
];

// ------------------------------- helpers -----------------------------------
class VoiceError extends Error {
	constructor(status, code) {
		super(code);
		this.status = status;
		this.code = code;
	}
}

function timeoutSignal(ms) {
	if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) return AbortSignal.timeout(ms);
	const c = new AbortController();
	setTimeout(() => c.abort(), ms);
	return c.signal;
}

function correctMishearings(text) {
	let out = ` ${String(text || "")} `;
	for (const [re, replacement] of MISHEARD_FIXES) out = out.replace(re, replacement);
	return out.replace(/\s+/g, " ").trim();
}

function normaliseTerms(items) {
	const seen = new Set();
	const out = [];
	for (const raw of items) {
		const term = String(raw || "")
			.toLowerCase()
			.replace(/[^\p{L}\p{N}\s-]/gu, "")
			.trim();
		if (term && !seen.has(term)) {
			seen.add(term);
			out.push(term);
		}
	}
	return out.slice(0, 10);
}

// Translate a provider HTTP status into our short error code. The provider's
// response BODY is logged server-side only — it can contain the key on a 401.
function providerError(status, body) {
	console.warn(`[voice] provider HTTP ${status}: ${String(body || "").slice(0, 300)}`);
	if (status === 429) return new VoiceError(429, "rate_limited");
	if (status === 413) return new VoiceError(413, "too_large");
	if (status === 401 || status === 403) return new VoiceError(503, "not_configured");
	return new VoiceError(502, "provider_error");
}

async function openaiFetch(path, options, timeoutMs) {
	try {
		return await fetch(`${OPENAI_BASE_URL}${path}`, { ...options, signal: timeoutSignal(timeoutMs) });
	} catch (err) {
		if (err && (err.name === "AbortError" || err.name === "TimeoutError")) {
			throw new VoiceError(504, "timeout");
		}
		throw new VoiceError(502, "provider_error");
	}
}

// ------------------------------ pipeline -----------------------------------
async function transcribe(file) {
	const attempt = async (model) => {
		const form = new FormData();
		form.append("file", new Blob([file.buffer], { type: file.mimetype || "audio/m4a" }), file.originalname || "voice-search.m4a");
		form.append("model", model);
		form.append("response_format", "json");
		form.append("prompt", SPEECH_HINT);
		form.append("temperature", "0");
		// No `language` field on purpose: auto-detect Arabic / Lebanese / English.
		return openaiFetch(
			"/audio/transcriptions",
			{ method: "POST", headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }, body: form },
			TRANSCRIBE_TIMEOUT_MS,
		);
	};

	let res = await attempt(TRANSCRIBE_MODEL);
	if (!res.ok && [400, 403, 404].includes(res.status)) {
		console.warn(`[voice] ${TRANSCRIBE_MODEL} unavailable (${res.status}), retrying with ${TRANSCRIBE_FALLBACK_MODEL}`);
		res = await attempt(TRANSCRIBE_FALLBACK_MODEL);
	}
	if (!res.ok) throw providerError(res.status, await res.text().catch(() => ""));
	const json = await res.json();
	return String(json && json.text ? json.text : "").trim();
}

async function interpret(transcript) {
	const clean = correctMishearings(transcript);
	if (!clean) return { intent: "search", market: "", items: [] };

	const res = await openaiFetch(
		"/chat/completions",
		{
			method: "POST",
			headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
			body: JSON.stringify({
				model: EXTRACT_MODEL,
				temperature: 0,
				max_tokens: 200,
				response_format: { type: "json_object" },
				messages: [{ role: "system", content: SYSTEM_PROMPT }, ...FEW_SHOTS, { role: "user", content: clean }],
			}),
		},
		EXTRACT_TIMEOUT_MS,
	);
	if (!res.ok) throw providerError(res.status, await res.text().catch(() => ""));

	const json = await res.json();
	const content = (json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || "{}";
	let parsed;
	try {
		parsed = JSON.parse(content);
	} catch {
		console.warn("[voice] unparseable model output:", content);
		return { intent: "search", market: "", items: [] };
	}
	const market = typeof parsed.market === "string" ? parsed.market.trim() : "";
	const items = Array.isArray(parsed.items) ? normaliseTerms(parsed.items) : [];
	if (parsed.intent === "open_market" && market) return { intent: "open_market", market, items: [] };
	return { intent: "search", market: "", items };
}

// ------------------------------- handler -----------------------------------
// @route   POST /api/voice/interpret
// @access  Public (rate-limited by the global limiter)
exports.interpretVoice = async (req, res) => {
	try {
		if (!OPENAI_API_KEY) return sendError(res, 503, "not_configured");
		const file = req.file;
		if (!file || !file.buffer || !file.buffer.length) return sendError(res, 400, "no_audio");

		const transcript = await transcribe(file);
		const { intent, market, items } = await interpret(transcript);

		return sendResponse(res, 200, true, "Success", { transcript, intent, market, items });
	} catch (err) {
		if (err instanceof VoiceError) return sendError(res, err.status, err.code);
		console.error("[voice] unexpected error:", err);
		return sendError(res, 500, "provider_error");
	}
};

exports._internal = { correctMishearings, normaliseTerms, providerError, VoiceError };
