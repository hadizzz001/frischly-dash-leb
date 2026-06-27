/*
 * Translation proxy controller.
 * ---------------------------------------------------------------------------
 * The browser cannot call MyMemory / Google directly because the page CSP
 * `connect-src` only allows same-origin. This server-side proxy does the
 * translation (no CSP, no browser CORS) with an automatic fallback and a
 * shared persistent cache so each unique UI string is only ever fetched once.
 *
 *   POST /api/translate   { q: string[], target: "ar", source?: "en" }
 *      -> { success: true, translations: string[] }   // same order as q
 *
 * Strategy per string:
 *   1. PRIMARY  — MyMemory (free, no key; optional MYMEMORY_EMAIL raises quota)
 *   2. FALLBACK — Google's public "gtx" endpoint (only if MyMemory is
 *      rate-limited / errors / is unreachable)
 *   3. If both fail, the original text is returned unchanged (never throws).
 */
const os = require("os");
const fs = require("fs");
const path = require("path");

const SUPPORTED = new Set(["en", "ar"]);
const MAX_ITEMS = 400; // per request
const MAX_LEN = 2000; // per string
const CONCURRENCY = 5;
const TIMEOUT_MS = 8000;
const MYMEMORY_EMAIL = process.env.MYMEMORY_EMAIL || "";

const cacheFile = path.join(os.tmpdir(), "frischly-translation-cache.json");
const cache = new Map();

// ----------------------------- persistent cache ----------------------------
(function loadCache() {
	try {
		if (fs.existsSync(cacheFile)) {
			const raw = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
			Object.keys(raw).forEach((k) => cache.set(k, raw[k]));
			console.log(`🌐 Loaded ${cache.size} cached translations`);
		}
	} catch (e) {
		/* ignore corrupt/absent cache */
	}
})();

let saveTimer = null;
function persist() {
	if (saveTimer) return;
	saveTimer = setTimeout(() => {
		saveTimer = null;
		try {
			const obj = {};
			cache.forEach((v, k) => (obj[k] = v));
			fs.writeFile(cacheFile, JSON.stringify(obj), () => {});
		} catch (e) {
			/* ignore */
		}
	}, 1500);
}

const keyOf = (source, target, text) => source + "|" + target + "|" + text;

function decodeEntities(s) {
	if (!s) return s;
	return s
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">");
}

function timeoutSignal() {
	// Node 18+: AbortSignal.timeout; fall back to manual controller.
	if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) {
		return AbortSignal.timeout(TIMEOUT_MS);
	}
	const c = new AbortController();
	setTimeout(() => c.abort(), TIMEOUT_MS);
	return c.signal;
}

// ------------------------------- providers ---------------------------------
async function viaMyMemory(text, target, source) {
	let url =
		"https://api.mymemory.translated.net/get?q=" +
		encodeURIComponent(text) +
		"&langpair=" +
		encodeURIComponent(source) +
		"|" +
		encodeURIComponent(target);
	if (MYMEMORY_EMAIL) url += "&de=" + encodeURIComponent(MYMEMORY_EMAIL);

	const res = await fetch(url, { signal: timeoutSignal() });
	if (!res.ok) throw new Error("MyMemory HTTP " + res.status);
	const data = await res.json();
	const status = data && data.responseStatus;
	const out = data && data.responseData && data.responseData.translatedText;
	const quotaHit =
		status === 403 ||
		status === 429 ||
		(typeof out === "string" &&
			/MYMEMORY WARNING|YOU USED ALL AVAILABLE|QUERY LENGTH LIMIT/i.test(out));
	if (quotaHit) throw new Error("MyMemory quota/limit reached");
	if (!out || typeof out !== "string") throw new Error("MyMemory empty result");
	return decodeEntities(out);
}

async function viaGoogle(text, target, source) {
	const url =
		"https://translate.googleapis.com/translate_a/single?client=gtx&sl=" +
		encodeURIComponent(source) +
		"&tl=" +
		encodeURIComponent(target) +
		"&dt=t&q=" +
		encodeURIComponent(text);
	const res = await fetch(url, { signal: timeoutSignal() });
	if (!res.ok) throw new Error("Google HTTP " + res.status);
	const data = await res.json();
	if (!Array.isArray(data) || !Array.isArray(data[0])) {
		throw new Error("Google unexpected response");
	}
	const joined = data[0]
		.map((chunk) => (Array.isArray(chunk) ? chunk[0] : ""))
		.join("");
	if (!joined) throw new Error("Google empty result");
	return joined;
}

// ------------------------- third fallback: Lingva --------------------------
// Lingva is a free, open-source Google-Translate front-end. Used only if both
// MyMemory and Google fail. A self-hosted/mirror instance can be set via
// LINGVA_URL (e.g. https://lingva.garudalinux.org).
async function viaLingva(text, target, source) {
	const base = (process.env.LINGVA_URL || "https://lingva.ml").replace(
		/\/+$/,
		""
	);
	const url =
		base +
		"/api/v1/" +
		encodeURIComponent(source) +
		"/" +
		encodeURIComponent(target) +
		"/" +
		encodeURIComponent(text);
	const res = await fetch(url, { signal: timeoutSignal() });
	if (!res.ok) throw new Error("Lingva HTTP " + res.status);
	const data = await res.json();
	if (!data || typeof data.translation !== "string" || !data.translation) {
		throw new Error("Lingva empty result");
	}
	return data.translation;
}

// Providers are tried in order; each one is only used if the previous failed
// (rate-limited / errored / unreachable).
const PROVIDERS = [
	["MyMemory", viaMyMemory],
	["Google", viaGoogle],
	["Lingva", viaLingva],
];

async function translateOne(text, target, source) {
	const k = keyOf(source, target, text);
	if (cache.has(k)) return cache.get(k);

	let out = null;
	const errors = [];
	for (const [name, fn] of PROVIDERS) {
		try {
			out = await fn(text, target, source);
			if (out) break; // success
		} catch (err) {
			errors.push(name + ": " + (err && err.message));
			out = null;
		}
	}
	if (out == null) {
		console.warn("[translate] all providers failed -> keeping English:", errors.join(" | "));
		out = text; // graceful: never throw, keep original
	}
	cache.set(k, out);
	persist();
	return out;
}

// ------------------------------- handler -----------------------------------
exports.translate = async (req, res) => {
	try {
		const body = req.body || {};
		const target = String(body.target || "ar");
		const source = String(body.source || "en");

		if (!SUPPORTED.has(target) || !SUPPORTED.has(source)) {
			return res
				.status(400)
				.json({ success: false, message: "Unsupported language" });
		}
		if (!Array.isArray(body.q)) {
			return res
				.status(400)
				.json({ success: false, message: "`q` must be an array of strings" });
		}
		if (body.q.length > MAX_ITEMS) {
			return res.status(400).json({
				success: false,
				message: `Too many items (max ${MAX_ITEMS})`,
			});
		}

		const items = body.q.map((s) =>
			typeof s === "string" ? s.slice(0, MAX_LEN) : ""
		);

		if (source === target) {
			return res.json({ success: true, translations: items });
		}

		const out = new Array(items.length);
		let idx = 0;
		async function worker() {
			while (idx < items.length) {
				const i = idx++;
				const s = items[i];
				out[i] = s ? await translateOne(s, target, source) : s;
			}
		}
		await Promise.all(
			Array.from({ length: Math.min(CONCURRENCY, items.length || 1) }, worker)
		);

		res.json({ success: true, translations: out });
	} catch (err) {
		console.error("translate error:", err);
		res.status(500).json({ success: false, message: "Translation failed" });
	}
};

// Exported for tests
exports._internal = { translateOne, viaMyMemory, viaGoogle, viaLingva, cache };
