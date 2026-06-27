/*
 * Freshly.lb — UI translation helper (Arabic) with safe, whole-page coverage.
 * ---------------------------------------------------------------------------
 * Talks to our OWN backend proxy (same-origin, allowed by the page CSP):
 *
 *     POST /api/translate  { q: string[], target:"ar", source:"en" }
 *
 * The proxy uses MyMemory (primary) with a Google fallback and a shared cache,
 * so the browser never has to call third-party APIs directly (which the CSP
 * `connect-src` blocks).
 *
 * Public API (window.Translator):
 *   translateText(text, target, source="en")       -> Promise<string>
 *   translateMap(obj,  target, source="en")         -> Promise<object>
 *   translateBatch(texts, target, source="en")      -> Promise<Map>
 *   applyPageLanguage(lang)                          -> Promise<void>
 *       lang "ar": translates the visible static UI + sets dir=rtl, and keeps
 *                  translating dynamically-added content via a MutationObserver.
 *       lang "en": restores the original English text + sets dir=ltr.
 *
 * Privacy: only *static UI chrome* is translated (headings, labels, buttons,
 * nav, table headers, placeholders…). Data cells (<td>), inputs' values,
 * <option>s and any element marked [data-no-translate] are never sent.
 */
(function () {
	"use strict";

	// Namespaced under window.FrischlyI18n on purpose: modern Chrome ships a
	// native `window.Translator` (the built-in Translation / on-device AI API)
	// which is a function. A `if (window.Translator) return;` guard would see
	// that native object as "already loaded" and bail out — which is exactly why
	// Arabic never applied. Using our own namespace avoids the collision.
	if (window.FrischlyI18n) return; // singleton

	var ENDPOINT = "/api/translate";
	var CACHE_PREFIX = "frx_tr_";
	var SOURCE = "en";
	var CHUNK = 80; // strings per network request

	// Lightweight, opt-in debug logging. Enable with ?i18ndebug in the URL or
	// localStorage.setItem('i18n-debug','1'). Off by default (no console noise).
	var DEBUG = false;
	try {
		DEBUG =
			/[?&]i18ndebug\b/.test(window.location.search) ||
			localStorage.getItem("i18n-debug") === "1";
	} catch (e) {}
	function log() {
		if (!DEBUG) return;
		try {
			console.log.apply(
				console,
				["[Translator]"].concat([].slice.call(arguments))
			);
		} catch (e) {}
	}

	// Whitelist of elements whose DIRECT text nodes are safe UI chrome.
	var SELECTORS = [
		".menu-text",
		".section-header h2",
		".section-header p",
		".settings-card h3",
		".setting-item label",
		".setting-description",
		".stat-box p",
		".stat-box h3",
		".modal-header h2",
		".modal-header h3",
		"h1",
		"h2",
		"h3",
		"h4",
		"h5",
		"label",
		"th",
		".btn",
		"button",
		".tab",
		".tab-button",
		".nav-tab",
		"[data-translation]",
	].join(",");

	var ATTR_SELECTOR =
		"input[placeholder]:not([type=password]),textarea[placeholder],button[title],.btn[title]";

	/* ------------------------------- caching ------------------------------- */
	function ck(target, source, text) {
		return CACHE_PREFIX + source + ":" + target + ":" + text;
	}
	function getCached(target, source, text) {
		try {
			return localStorage.getItem(ck(target, source, text));
		} catch (e) {
			return null;
		}
	}
	function setCached(target, source, text, value) {
		try {
			localStorage.setItem(ck(target, source, text), value);
		} catch (e) {
			/* storage full — ignore */
		}
	}

	/* ------------------------------- helpers ------------------------------- */
	// Decide whether a string is worth translating (and safe to send).
	function isTranslatable(text) {
		if (text == null) return false;
		var t = String(text).trim();
		if (t.length < 2) return false;
		if (!/[A-Za-z]/.test(t)) return false; // must contain Latin letters
		if (/[\u0600-\u06FF]/.test(t)) return false; // already Arabic
		if (/\{[^}]*\}/.test(t)) return false; // runtime {placeholder}
		if (/^\s*\$?\d/.test(t)) return false; // numbers / prices / quantities
		if (/^\S+@\S+\.\S+$/.test(t)) return false; // email
		if (/^https?:\/\//i.test(t)) return false; // url
		return true;
	}

	// Heuristic: skip elements that clearly hold dynamic DATA (names, emails…)
	// so we never translate (or transmit) user/business data.
	function looksLikeData(el) {
		if (!el) return false;
		var id = el.id || "";
		var cls = typeof el.className === "string" ? el.className : "";
		var s = (id + " " + cls).toLowerCase();
		return /(name|email|phone|mobile|address|user|count|number|price|total|amount|balance|date|time|qty|quantity|\bid\b|code|sku|barcode|value)/.test(
			s
		);
	}

	/* --------------------------- batch translate --------------------------- */
	async function postBatch(texts, target, source) {
		log("POST", ENDPOINT, "items=" + texts.length, "->", target);
		var res = await fetch(ENDPOINT, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ q: texts, target: target, source: source }),
		});
		log("response status", res.status, res.ok ? "OK" : "NOT OK");
		if (!res.ok) throw new Error("translate HTTP " + res.status);
		var data = await res.json();
		if (!data || !Array.isArray(data.translations)) {
			throw new Error("translate bad response");
		}
		return data.translations;
	}

	// Returns Map<originalTrimmed, translated>. Cache-first; failures keep English.
	async function translateBatch(texts, target, source) {
		source = source || SOURCE;
		var map = new Map();
		if (!texts || !texts.length) return map;
		if (target === source) {
			texts.forEach(function (t) {
				map.set(t, t);
			});
			return map;
		}

		var misses = [];
		var miss = {};
		texts.forEach(function (t) {
			if (map.has(t)) return;
			var c = getCached(target, source, t);
			if (c != null) {
				map.set(t, c);
			} else if (!miss[t]) {
				miss[t] = true;
				misses.push(t);
			}
		});

		for (var i = 0; i < misses.length; i += CHUNK) {
			var chunk = misses.slice(i, i + CHUNK);
			try {
				var out = await postBatch(chunk, target, source);
				for (var j = 0; j < chunk.length; j++) {
					var tr = out[j] != null ? out[j] : chunk[j];
					setCached(target, source, chunk[j], tr);
					map.set(chunk[j], tr);
				}
			} catch (e) {
				console.warn("[Translator] batch failed:", e && e.message);
				chunk.forEach(function (s) {
					map.set(s, s); // graceful: keep original English
				});
			}
		}
		return map;
	}

	async function translateText(text, target, source) {
		source = source || SOURCE;
		if (!text || target === source) return text;
		if (!isTranslatable(text)) return text;
		var key = String(text).trim();
		var m = await translateBatch([key], target, source);
		return m.get(key) || text;
	}

	async function translateMap(obj, target, source) {
		source = source || SOURCE;
		var result = {};
		if (!obj) return result;
		var keys = Object.keys(obj);
		var values = [];
		keys.forEach(function (k) {
			var v = obj[k];
			if (typeof v === "string" && isTranslatable(v)) values.push(v.trim());
		});
		var m = await translateBatch(values, target, source);
		keys.forEach(function (k) {
			var v = obj[k];
			if (typeof v === "string" && isTranslatable(v)) {
				result[k] = m.get(v.trim()) || v;
			} else {
				result[k] = v;
			}
		});
		return result;
	}

	/* ----------------------- whole-page UI translation --------------------- */
	var activeLang = SOURCE;
	var observer = null;
	var seen = null; // WeakSet of text nodes handled this activation
	var translatedNodes = []; // { node, original }
	var translatedAttrs = []; // { el, attr, original }

	function collect(root) {
		var textTargets = [];
		var attrTargets = [];

		var matches = [];
		if (root.nodeType === 1 && root.matches && root.matches(SELECTORS)) {
			matches.push(root);
		}
		if (root.querySelectorAll) {
			var found = root.querySelectorAll(SELECTORS);
			for (var a = 0; a < found.length; a++) matches.push(found[a]);
		}

		matches.forEach(function (el) {
			if (el.closest && el.closest("[data-no-translate]")) return;
			if (looksLikeData(el)) return;
			// Only DIRECT child text nodes -> preserves icons & nested data spans.
			for (var n = 0; n < el.childNodes.length; n++) {
				var node = el.childNodes[n];
				if (node.nodeType !== 3) continue; // text only
				if (seen.has(node)) continue;
				if (!isTranslatable(node.nodeValue)) continue;
				seen.add(node);
				textTargets.push({
					node: node,
					trimmed: node.nodeValue.trim(),
					original: node.nodeValue,
				});
			}
		});

		// Attributes (placeholders / button titles) — static UI only.
		var attrEls = [];
		if (root.nodeType === 1 && root.matches && root.matches(ATTR_SELECTOR)) {
			attrEls.push(root);
		}
		if (root.querySelectorAll) {
			var fa = root.querySelectorAll(ATTR_SELECTOR);
			for (var b = 0; b < fa.length; b++) attrEls.push(fa[b]);
		}
		attrEls.forEach(function (el) {
			if (el.closest && el.closest("[data-no-translate]")) return;
			["placeholder", "title"].forEach(function (attr) {
				if (!el.hasAttribute(attr)) return;
				if (el.hasAttribute("data-i18n-" + attr)) return; // already done
				var val = el.getAttribute(attr);
				if (!isTranslatable(val)) return;
				attrTargets.push({ el: el, attr: attr, trimmed: val.trim(), original: val });
			});
		});

		return { textTargets: textTargets, attrTargets: attrTargets };
	}

	async function translateAndApply(root, target) {
		var t = collect(root);
		log(
			"collected text nodes=" + t.textTargets.length,
			"attrs=" + t.attrTargets.length
		);
		if (!t.textTargets.length && !t.attrTargets.length) return;

		var strings = [];
		t.textTargets.forEach(function (x) {
			strings.push(x.trimmed);
		});
		t.attrTargets.forEach(function (x) {
			strings.push(x.trimmed);
		});

		var map = await translateBatch(strings, target, SOURCE);

		var applied = 0;
		t.textTargets.forEach(function (x) {
			var tr = map.get(x.trimmed);
			if (tr == null || tr === x.trimmed) return;
			// keep original leading/trailing whitespace
			x.node.nodeValue = x.original.replace(x.trimmed, tr);
			translatedNodes.push({ node: x.node, original: x.original });
			applied++;
		});
		t.attrTargets.forEach(function (x) {
			var tr = map.get(x.trimmed);
			if (tr == null || tr === x.trimmed) return;
			x.el.setAttribute("data-i18n-" + x.attr, x.original);
			x.el.setAttribute(x.attr, tr);
			translatedAttrs.push({ el: x.el, attr: x.attr, original: x.original });
			applied++;
		});
		log("applied translations:", applied);
	}

	function restore() {
		translatedNodes.forEach(function (x) {
			try {
				x.node.nodeValue = x.original;
			} catch (e) {
				/* node gone */
			}
		});
		translatedAttrs.forEach(function (x) {
			try {
				x.el.setAttribute(x.attr, x.original);
				x.el.removeAttribute("data-i18n-" + x.attr);
			} catch (e) {
				/* element gone */
			}
		});
		translatedNodes = [];
		translatedAttrs = [];
	}

	var pendingRoots = [];
	var flushTimer = null;
	function scheduleFlush(target) {
		if (flushTimer) return;
		flushTimer = setTimeout(function () {
			flushTimer = null;
			var roots = pendingRoots;
			pendingRoots = [];
			roots.forEach(function (r) {
				if (r && r.isConnected !== false) translateAndApply(r, target);
			});
		}, 150);
	}

	function startObserver(target) {
		if (observer || typeof MutationObserver === "undefined") return;
		observer = new MutationObserver(function (muts) {
			for (var i = 0; i < muts.length; i++) {
				var added = muts[i].addedNodes;
				for (var j = 0; j < added.length; j++) {
					if (added[j].nodeType === 1) pendingRoots.push(added[j]);
				}
			}
			if (pendingRoots.length) scheduleFlush(target);
		});
		observer.observe(document.body, { childList: true, subtree: true });
	}
	function stopObserver() {
		if (observer) {
			observer.disconnect();
			observer = null;
		}
		pendingRoots = [];
		if (flushTimer) {
			clearTimeout(flushTimer);
			flushTimer = null;
		}
	}

	async function applyPageLanguage(lang) {
		lang = lang || SOURCE;
		log("applyPageLanguage(" + lang + ") activeLang=" + activeLang);
		var html = document.documentElement;

		if (lang === SOURCE) {
			if (activeLang !== SOURCE) {
				stopObserver();
				restore();
				seen = null;
				activeLang = SOURCE;
			}
			html.setAttribute("dir", "ltr");
			html.setAttribute("lang", "en");
			return;
		}

		if (activeLang === lang) {
			// already active — just (re)translate anything new
			html.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
			html.setAttribute("lang", lang);
			await translateAndApply(document.body, lang);
			return;
		}

		// switching from another active language (only en/ar exist) → reset first
		if (activeLang !== SOURCE) {
			stopObserver();
			restore();
		}

		seen = typeof WeakSet !== "undefined" ? new WeakSet() : { has: function () { return false; }, add: function () {} };
		translatedNodes = [];
		translatedAttrs = [];
		activeLang = lang;

		html.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
		html.setAttribute("lang", lang);
		if (document.body) document.body.setAttribute("data-translating", "1");
		try {
			await translateAndApply(document.body, lang);
		} finally {
			if (document.body) document.body.removeAttribute("data-translating");
		}
		startObserver(lang);
	}

	window.FrischlyI18n = {
		translateText: translateText,
		translateMap: translateMap,
		translateBatch: translateBatch,
		applyPageLanguage: applyPageLanguage,
		isTranslatable: isTranslatable,
		get language() {
			return activeLang;
		},
	};
})();
