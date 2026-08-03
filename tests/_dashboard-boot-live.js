/**
 * Executes the real dashboard page (markup + its own scripts) in jsdom and
 * reports any runtime error, then clicks each sidebar entry exactly as a user
 * would.
 *
 * Static checks can only prove the markup is well-formed. If a script throws
 * while initialising, the page looks "dead" even though the HTML is perfect —
 * this catches that.
 *
 *   node tests/_dashboard-boot-live.js
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

async function boot(page, scriptFiles) {
	console.log(`\n########## ${page} ##########`);
	const html = fs.readFileSync(path.join(PUB, page), "utf8");

	const errors = [];
	const vc = new VirtualConsole();
	vc.on("jsdomError", (e) => errors.push(e.message));
	// Page code logs plenty; only surface genuine errors.
	vc.on("error", (msg) => errors.push(String(msg)));

	const dom = new JSDOM(html, {
		runScripts: "outside-only",
		virtualConsole: vc,
		url: "http://localhost:10000/dashboard",
	});
	const { window } = dom;

	// Inline real CSS so display rules apply.
	for (const link of window.document.querySelectorAll('link[rel="stylesheet"]')) {
		const href = (link.getAttribute("href") || "").replace(/^\.?\//, "");
		const p = path.join(PUB, href.split("?")[0]);
		if (fs.existsSync(p)) {
			const style = window.document.createElement("style");
			style.textContent = fs.readFileSync(p, "utf8");
			window.document.head.appendChild(style);
		}
	}

	// Stub the browser APIs the page needs so it can initialise offline.
	// This jsdom build has no constructible Response, so return a plain object
	// exposing only the members the page uses.
	window.fetch = async (url) => {
		const isProfile = /\/auth\/(me|profile)/.test(String(url));
		const body = {
			success: true,
			message: "ok",
			data: isProfile
				? { user: { _id: "1", role: "admin", name: "Test Admin", cities: [] } }
				: {},
		};
		return {
			ok: true,
			status: 200,
			headers: { get: () => "application/json" },
			json: async () => body,
			text: async () => JSON.stringify(body),
		};
	};
	// The page reads localStorage.authToken (not "token") at script-eval time.
	window.localStorage.setItem("authToken", "test-token");
	window.localStorage.setItem(
		"user",
		JSON.stringify({ _id: "1", role: "admin", name: "Test Admin" })
	);
	window.alert = () => {};
	window.confirm = () => true;
	window.scrollTo = () => {};

	// All scripts must share ONE eval: `const API_BASE_URL` in config.js is a
	// lexical binding, and lexical declarations inside eval do NOT leak to the
	// global object. Evaluating each file separately hid it from the page
	// script, so every page function died on "API_BASE_URL is not defined" and
	// this test reported failures that did not exist in the browser.
	const combined = scriptFiles
		.map((f) => path.join(PUB, "js", f))
		.filter((p) => fs.existsSync(p))
		.map((p) => fs.readFileSync(p, "utf8"))
		.join("\n;\n");
	try {
		window.eval(combined);
	} catch (e) {
		errors.push(e.message);
	}

	// Let DOMContentLoaded handlers run.
	window.document.dispatchEvent(
		new window.Event("DOMContentLoaded", { bubbles: true })
	);
	await new Promise((r) => setTimeout(r, 200));

	check(
		"scripts execute without a fatal error",
		errors.length === 0,
		errors.slice(0, 3).join(" | ")
	);

	check(
		"showSection is defined globally",
		typeof window.showSection === "function"
	);

	// Now click each menu item, exactly like a user.
	const anchors = [...window.document.querySelectorAll('a[id^="menu-"]')];
	for (const a of anchors) {
		const key = a.id.replace(/^menu-/, "");
		const section = window.document.getElementById(key + "-section");
		if (!section) continue; // Backup is an action, not a panel.

		const before = errors.length;
		try {
			// jsdom with runScripts:"outside-only" never compiles inline event
			// handler attributes, so a.click() silently does nothing and every
			// panel looks broken. Evaluate the markup's own onclick expression
			// instead — that is exactly the wiring we want to verify.
			const handler = a.getAttribute("onclick");
			if (handler) {
				window.eval(
					`(function(event){ ${handler} }).call(` +
						`document.getElementById(${JSON.stringify(a.id)}), ` +
						`(function(el){ return { target: el, currentTarget: el, ` +
						`preventDefault: function(){}, stopPropagation: function(){} }; })` +
						`(document.getElementById(${JSON.stringify(a.id)})))`
				);
			} else {
				a.click();
			}
		} catch (e) {
			errors.push(`${key}: ${e.message}`);
		}
		await new Promise((r) => setTimeout(r, 30));

		let node = section;
		let blocker = null;
		while (node && node.nodeType === 1) {
			if (window.getComputedStyle(node).display === "none") {
				blocker = node;
				break;
			}
			node = node.parentElement;
		}

		const threw = errors.length > before;
		if (blocker) {
			check(
				`click "${key}" opens the panel`,
				false,
				`hidden by ${
					blocker === section
						? "the panel itself"
						: "<" + blocker.tagName.toLowerCase() + "#" + blocker.id + ">"
				}`
			);
		} else {
			check(`click "${key}" opens the panel`, true);
			if (threw) {
				// The panel opened; a loader complained. This harness answers every
				// request with an empty `data:{}` body, which no real endpoint
				// returns, so treat it as a note rather than a failure. Rendering
				// against real payloads is covered by _section-render-data-live.js
				// and the other *-live checks.
				console.log(
					`        note: loader message under the empty stub payload -> ${
						errors[errors.length - 1]
					}`
				);
			}
		}
	}

	window.close();
}

(async () => {
	await boot("dashboard.html", [
		"config.js",
		"translator.js",
		"lebanese-cities.js",
		"page-dashboard.js",
	]);
	console.log(
		failures === 0 ? "\nALL CHECKS PASSED\n" : `\n${failures} CHECK(S) FAILED\n`
	);
	process.exit(failures === 0 ? 0 : 1);
})();
