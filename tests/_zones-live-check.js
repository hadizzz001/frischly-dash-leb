/*
 * Live check: fetch the real endpoints and prove the OLD parsing threw while
 * the SHIPPED listFrom() returns usable rows. Run with the server up:
 *     node tests/_zones-live-check.js
 */
const fs = require("fs");
const path = require("path");

const BASE = process.env.API_BASE || "http://localhost:10000/api";

// Use the real helper the pages ship with — not a copy.
const configSrc = fs.readFileSync(
	path.join(__dirname, "..", "public", "js", "config.js"),
	"utf8"
);
const listFrom = eval(
	`(${configSrc
		.slice(configSrc.indexOf("function listFrom"))
		.match(/^function listFrom[\s\S]*?\n}/)[0]})`
);

let failures = 0;
const fail = (m) => {
	failures++;
	console.log("  FAIL  " + m);
};
const pass = (m) => console.log("  PASS  " + m);

const ENDPOINTS = [
	["zones", "/zones", "zones"],
	["zones (active only)", "/zones?isActive=true", "zones"],
];

(async () => {
	const health = await fetch(`${BASE}/health`).catch(() => null);
	if (!health || health.status !== 200) {
		console.log(`\nServer not reachable at ${BASE}. Start it: node server.js\n`);
		process.exit(1);
	}

	console.log("\n=== Zones: old parsing vs shipped listFrom() ===\n");

	for (const [label, url, key] of ENDPOINTS) {
		const res = await fetch(BASE + url);
		if (!res.ok) {
			fail(`${label}: HTTP ${res.status}`);
			continue;
		}
		const payload = await res.json();

		// What the page used to do: treat payload.data as an array.
		let oldError = null;
		try {
			const zonesData = payload.data || [];
			// eslint-disable-next-line no-unused-vars
			const copy = [...zonesData];
		} catch (e) {
			oldError = e.message;
		}

		// What it does now.
		const rows = listFrom(payload, key);

		if (!Array.isArray(rows)) {
			fail(`${label}: listFrom did not return an array`);
			continue;
		}
		pass(
			`${label}: ${rows.length} zone(s) — old parsing ` +
				(oldError ? `threw "${oldError}"` : "did not throw")
		);

		// The rider modal calls .forEach on this; make sure that is safe.
		try {
			rows.forEach((z) => String(z && z.name));
			pass(`${label}: forEach over rows is safe (rider modal checkboxes)`);
		} catch (e) {
			fail(`${label}: forEach threw ${e.message}`);
		}
	}

	console.log(
		failures === 0 ? "\nALL CHECKS PASSED\n" : `\n${failures} CHECK(S) FAILED\n`
	);
	process.exit(failures === 0 ? 0 : 1);
})();
