/*
 * Freshly.lb — audit: list reads that ASSUME the payload is already an array.
 *
 * Background
 * ----------
 * Most list endpoints answer with the record array nested under a named key:
 *
 *     GET /zones  ->  { success, data: { zones: [...], pagination: {...} } }
 *
 * So `result.data` is an OBJECT, not an array. Code like
 *
 *     zonesData = result.data || [];      // an object, not a list
 *     [...zonesData]                      // TypeError: not iterable
 *     zones.forEach(...)                  // TypeError: not a function
 *     records.length === 0                // undefined === 0 -> false
 *
 * fails at runtime. Because these calls sit inside a try/catch, the real
 * TypeError is swallowed and the user sees a misleading message such as
 * "Failed to load zones" — which points at the network or the database
 * rather than at the parsing bug that actually caused it.
 *
 * This audit fails whenever a list endpoint's payload is consumed as an array
 * without going through listFrom().
 */
const fs = require("fs");
const path = require("path");

const JS_DIR = path.join(__dirname, "..", "public", "js");
const CTRL_DIR = path.join(__dirname, "..", "src", "controllers");

let failures = 0;
const fail = (m) => {
	failures++;
	console.log("  FAIL  " + m);
};
const pass = (m) => console.log("  PASS  " + m);

// ── 1. Which endpoints nest their array under a named key? ───────────────────
console.log("\n=== 1. Endpoints whose list is nested under a named key ===\n");

// Collect `const ras = { <key>, pagination... }` style envelopes.
const nested = new Map(); // key -> controller
for (const f of fs.readdirSync(CTRL_DIR).filter((n) => n.endsWith(".js"))) {
	const src = fs.readFileSync(path.join(CTRL_DIR, f), "utf8");
	const re = /const\s+ras\d*\s*=\s*\{([\s\S]{0,400}?)\n\t*\};/g;
	for (const m of src.matchAll(re)) {
		const body = m[1];
		if (!/pagination|count|total/i.test(body)) continue;
		// First shorthand property is the collection.
		const first = body.match(/^\s*([a-zA-Z][a-zA-Z0-9]*)\s*,/m);
		if (first) nested.set(first[1], f);
	}
}
console.log(
	"  nested collections: " +
		[...nested.keys()].sort().join(", ")
);

// ── 2. Frontend: payload consumed as an array without listFrom() ────────────
console.log("\n=== 2. Frontend list reads ===\n");

// `x = <obj>.data || []` then used as an array is the classic failure.
const BAD_READ =
	/(?:const|let|var)?\s*(\w+)\s*=\s*(?:result|data|json|j|payload)\.data\s*\|\|\s*\[\]/g;

// `Array.isArray(<obj>.data) ? <obj>.data : []` is the same bug wearing a
// safety belt: the guard never throws, it just yields [] forever, so the table
// renders "no data" while the records sit in the response untouched. This is
// WORSE than the crash — nothing is logged and nothing looks broken.
const BAD_GUARD =
	/Array\.isArray\(\s*(?:result|data|json|j|payload)\.data\s*\)\s*\?/;

for (const file of fs.readdirSync(JS_DIR).filter((f) => f.endsWith(".js"))) {
	const src = fs.readFileSync(path.join(JS_DIR, file), "utf8");
	const lines = src.split("\n");

	lines.forEach((line, i) => {
		if (line.trim().startsWith("//")) return; // commented-out code
		BAD_READ.lastIndex = 0;
		const m = BAD_READ.exec(line);
		if (!m) return;
		const varName = m[1];

		// Which endpoint was fetched just above?
		const ctx = lines.slice(Math.max(0, i - 15), i).join("\n");
		const epMatch = ctx.match(/\/(zones|waste|riders|orders|products|users|categories|markets|shelves)\b/);
		if (!epMatch) return;

		// Is the variable then treated as an array?
		const after = lines.slice(i + 1, i + 40).join("\n");
		const usedAsArray = new RegExp(
			`\\[\\s*\\.\\.\\.${varName}\\s*\\]|${varName}\\.(forEach|map|filter|length|slice|some|every)\\b`
		).test(after);
		if (!usedAsArray) return;

		fail(
			`${file}:${i + 1} "${varName} = …data || []" after /${epMatch[1]} ` +
				`then used as an array — payload is a wrapper; use listFrom(…, "…")`
		);
	});

	// Reading a *named* collection straight off the envelope (missing .data).
	lines.forEach((line, i) => {
		if (line.trim().startsWith("//")) return;
		if (!BAD_GUARD.test(line)) return;
		// Which endpoint was fetched just above?
		const ctx = lines.slice(Math.max(0, i - 15), i).join("\n");
		const ep = ctx.match(
			/\/(zones|waste|riders|orders|products|users|categories|markets|shelves|feedback|kitchens|kitchen-categories|announcements|promocodes)\b/
		);
		if (!ep) return;
		fail(
			`${file}:${i + 1} Array.isArray(…data) guard after /${ep[1]} — the ` +
				`payload is a wrapper, so this silently yields [] forever; use listFrom()`
		);
	});

	lines.forEach((line, i) => {
		if (line.trim().startsWith("//")) return;
		const m = line.match(
			/(?:const|let|var)\s+\w+\s*=\s*await\s+\w+\.json\(\)\s*;?\s*$/
		);
		if (!m) return;
		const varName = line.match(/(?:const|let|var)\s+(\w+)\s*=/)[1];
		// If the next lines read <var>.<field> for a field that is NOT part of
		// the envelope, the code forgot to go through .data. Strip comments
		// first — prose like "may return it under data.user" is documentation,
		// not a real property read.
		const after = lines
			.slice(i + 1, i + 25)
			.map((l) => l.replace(/\/\/.*$/, ""))
			.join("\n");
		const envelopeKeys = ["data", "success", "message", "errors", "meta", "token"];
		// `(?<!\.)` so the inner `data` of `data.data.user` is not mistaken for
		// a stray read off the envelope — that code is already unwrapping.
		const reads = [
			...after.matchAll(
				new RegExp(`(?<![.\\w])${varName}\\.([a-zA-Z][a-zA-Z0-9]*)`, "g")
			),
		].map((x) => x[1]);
		const stray = [...new Set(reads)].filter((k) => !envelopeKeys.includes(k));
		if (stray.length >= 2) {
			fail(
				`${file}:${i + 1} "${varName}" is the ENVELOPE but is read for ` +
					`${stray.slice(0, 4).join(", ")} — these live under ${varName}.data`
			);
		}
	});
}
if (failures === 0) pass("no list read treats a wrapper object as an array");

// ── 3. listFrom() really handles the shapes these endpoints emit ────────────
console.log("\n=== 3. listFrom() against the real envelopes ===\n");

const configSrc = fs.readFileSync(path.join(JS_DIR, "config.js"), "utf8");
const listFrom = eval(
	`(${configSrc.slice(configSrc.indexOf("function listFrom")).match(/^function listFrom[\s\S]*?\n}/)[0]})`
);

const CASES = [
	[
		"zones",
		{ success: true, data: { zones: [{ _id: "z1" }], pagination: { total: 1 } } },
		"zones",
		1,
	],
	[
		"waste",
		{ success: true, data: { waste: [{ _id: "w1" }, { _id: "w2" }], total: 2 } },
		"waste",
		2,
	],
	[
		"riders",
		{ success: true, data: { riders: [{ _id: "r1" }], pagination: {} } },
		"riders",
		1,
	],
	["users", { success: true, data: { users: [{ _id: "u1" }] } }, "users", 1],
	["empty zones", { success: true, data: { zones: [], pagination: {} } }, "zones", 0],
	["error envelope", { success: false, message: "nope" }, "zones", 0],
	["null payload", null, "zones", 0],
];
for (const [label, payload, key, expected] of CASES) {
	const out = listFrom(payload, key);
	if (!Array.isArray(out)) fail(`${label}: listFrom did not return an array`);
	else if (out.length !== expected)
		fail(`${label}: expected ${expected} rows, got ${out.length}`);
	else pass(`${label} -> ${out.length} row(s)`);
}

// The exact crash the user hit.
const zonesWrapper = { success: true, data: { zones: [{ _id: "z" }], pagination: {} } };
let threw = false;
try {
	// Old code: spread the wrapper object.
	[...zonesWrapper.data];
} catch {
	threw = true;
}
if (!threw) fail("expected the old wrapper-spread to throw (test is stale)");
else pass("reproduced: spreading the wrapper throws (the 'Failed to load zones' cause)");
try {
	const fixed = [...listFrom(zonesWrapper, "zones")];
	if (fixed.length === 1) pass("fixed: listFrom yields a spreadable array");
	else fail("listFrom returned the wrong row count");
} catch (e) {
	fail("listFrom still throws: " + e.message);
}

console.log(
	failures === 0 ? "\nALL CHECKS PASSED\n" : `\n${failures} CHECK(S) FAILED\n`
);
process.exit(failures === 0 ? 0 : 1);
