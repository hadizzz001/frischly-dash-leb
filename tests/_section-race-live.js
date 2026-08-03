/**
 * Reproduces the "section will not open" race and proves it is fixed.
 *
 * Symptom: clicking Promo Codes / Announcements appeared to do nothing.
 * Cause: loadUserProfile() resolves asynchronously and THEN opens the
 * "initial" section. If the user clicked while that request was still in
 * flight, the late call yanked them back to Products — the panel opened for a
 * few milliseconds and snapped shut, which looks exactly like a dead link.
 *
 * The test drives the real page scripts in a real DOM with a deliberately SLOW
 * profile response, clicks a section immediately, and asserts the user's
 * choice survives.
 *
 *   node tests/_section-race-live.js
 */
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const PUB = path.join(__dirname, "..", "public");
let failures = 0;
const check = (name, ok, detail) => {
	console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " -> " + detail : ""}`);
	if (!ok) failures++;
};

const USER = {
	_id: "u1",
	name: "Test Admin",
	email: "admin@test.local",
	role: "admin",
	cities: [],
};

function buildFetch(window, delayMs) {
	return async (url) => {
		const u = String(url);
		// Everything else answers instantly; only the profile is slow, which is
		// what opens the race window in the real app.
		const body = /\/auth\/(me|profile)/.test(u)
			? { success: true, message: "ok", data: { user: USER } }
			: { success: true, message: "ok", data: {} };
		if (/\/auth\/(me|profile)/.test(u)) {
			await new Promise((r) => setTimeout(r, delayMs));
		}
		// This jsdom build does not expose a constructible Response, so hand back
		// a plain object with the members the page actually uses.
		return {
			ok: true,
			status: 200,
			headers: { get: () => "application/json" },
			json: async () => body,
			text: async () => JSON.stringify(body),
		};
	};
}

async function run(page, scripts, sectionKey, profileDelayMs) {
	const html = fs.readFileSync(path.join(PUB, page), "utf8");
	const vc = new VirtualConsole(); // stay quiet; the page logs a lot
	const dom = new JSDOM(html, {
		runScripts: "outside-only",
		virtualConsole: vc,
		url: "http://localhost:10000/dashboard",
	});
	const { window } = dom;
	const doc = window.document;

	for (const link of doc.querySelectorAll('link[rel="stylesheet"]')) {
		const href = (link.getAttribute("href") || "").replace(/^\.?\//, "");
		const p = path.join(PUB, href.split("?")[0]);
		if (fs.existsSync(p)) {
			const s = doc.createElement("style");
			s.textContent = fs.readFileSync(p, "utf8");
			doc.head.appendChild(s);
		}
	}

	window.fetch = buildFetch(window, profileDelayMs);
	window.localStorage.setItem("token", "test-token");
	window.localStorage.setItem("user", JSON.stringify(USER));
	window.alert = () => {};
	window.confirm = () => true;
	window.scrollTo = () => {};

	// All scripts must share ONE eval: `const API_BASE_URL` in config.js is a
	// lexical binding, and lexical declarations inside eval do NOT become
	// globals. Evaluating each file separately hid it from the page script and
	// every page function died on "API_BASE_URL is not defined" — which made
	// this test silently vacuous.
	const combined = scripts
		.map((f) => path.join(PUB, "js", f))
		.filter((p) => fs.existsSync(p))
		.map((p) => fs.readFileSync(p, "utf8"))
		.join("\n;\n");
	try {
		window.eval(combined);
	} catch (e) {
		console.log(`    (script error: ${e.message})`);
	}

	doc.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));

	// The user clicks straight away, while the profile request is still pending.
	await new Promise((r) => setTimeout(r, 10));
	if (typeof window.showSection === "function") window.showSection(sectionKey);

	const immediately = doc.querySelector(".content-section.active");
	// Wait until well after the profile response lands.
	await new Promise((r) => setTimeout(r, profileDelayMs + 150));
	const afterwards = doc.querySelector(".content-section.active");

	const result = {
		immediately: immediately ? immediately.id : "(none)",
		afterwards: afterwards ? afterwards.id : "(none)",
	};
	window.close();
	return result;
}

(async () => {
	const SCRIPTS = {
		"dashboard.html": [
			"config.js",
			"translator.js",
			"lebanese-cities.js",
			"page-dashboard.js",
		],
		"market-dashboard.html": [
			"config.js",
			"translator.js",
			"lebanese-cities.js",
			"page-market-dashboard.js",
		],
	};

	for (const page of Object.keys(SCRIPTS)) {
		console.log(`\n########## ${page} ##########`);
		for (const key of ["promocodes", "announcements", "kitchens", "waste"]) {
			const r = await run(page, SCRIPTS[page], key, 250);
			check(
				`"${key}" stays open while the profile request resolves`,
				r.immediately === `${key}-section` && r.afterwards === `${key}-section`,
				`opened ${r.immediately}, ended on ${r.afterwards}`
			);
		}
	}

	console.log(
		failures === 0 ? "\nALL CHECKS PASSED\n" : `\n${failures} CHECK(S) FAILED\n`
	);
	process.exit(failures === 0 ? 0 : 1);
})();
