/*
 * Freshly.lb — CRUD audit for the admin sections.
 *
 * For each section (Waste, Promo Codes, Announcements, For Kitchens, Kitchen
 * Categories, Settings, Profile, Backup) this cross-references what the pages
 * CALL against what the server actually SERVES, and checks how each response
 * is parsed.
 *
 * Three failure modes have already bitten this project repeatedly:
 *
 *   1. Route mismatch — the page calls a URL/verb the router does not expose,
 *      so the action 404s.
 *   2. Wrapper reads — the API answers { data: { <key>: [...] } } but the page
 *      reads `X.data`, silently yielding [] or undefined.
 *   3. Unguarded refresh — create/update/delete succeeds but the list is never
 *      reloaded, so the UI looks broken.
 *
 * Run:  node tests/_crud-sections-audit.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const JS_DIR = path.join(ROOT, "public", "js");
const ROUTES_DIR = path.join(ROOT, "src", "routes");

let failures = 0;
const fail = (m) => {
	failures++;
	console.log("  FAIL  " + m);
};
const pass = (m) => console.log("  PASS  " + m);
const info = (m) => console.log("  ..    " + m);

// ── Build the real route table from server.js + the route files ─────────────
const serverSrc = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
const mounts = {}; // routeFile -> mount path
for (const m of serverSrc.matchAll(
	/app\.use\(\s*"(\/api\/[^"]+)"\s*,\s*(\w+)\s*\)/g
)) {
	mounts[m[2]] = m[1];
}
// requires: const wasteRoutes = require("./src/routes/waste");
const varToFile = {};
for (const m of serverSrc.matchAll(
	/const\s+(\w+)\s*=\s*require\(\s*"\.\/src\/routes\/([\w-]+)"\s*\)/g
)) {
	varToFile[m[1]] = m[2] + ".js";
}

const routes = []; // { method, path }
for (const [varName, mount] of Object.entries(mounts)) {
	const file = varToFile[varName];
	if (!file) continue;
	const p = path.join(ROUTES_DIR, file);
	if (!fs.existsSync(p)) continue;
	const src = fs.readFileSync(p, "utf8");

	// Style A:  router.get("/x", handler)
	for (const m of src.matchAll(
		/router\s*\.\s*(get|post|put|patch|delete)\s*\(\s*"([^"]*)"/g
	)) {
		const sub = m[2] === "/" ? "" : m[2];
		routes.push({ method: m[1].toUpperCase(), path: mount + sub, file });
	}

	// Style B:  router.route("/x").get(...).post(...).delete(...)
	// Several route files use this chained form; missing it makes every call
	// to those endpoints look like a 404 when the route exists.
	for (const m of src.matchAll(/router\s*\.\s*route\s*\(\s*"([^"]*)"\s*\)/g)) {
		const sub = m[1] === "/" ? "" : m[1];
		// Read the chain that follows, up to the terminating semicolon.
		const rest = src.slice(m.index + m[0].length);
		const chain = rest.slice(0, rest.indexOf(";") + 1);
		for (const v of chain.matchAll(/\.\s*(get|post|put|patch|delete)\s*\(/g)) {
			routes.push({ method: v[1].toUpperCase(), path: mount + sub, file });
		}
	}
}

// Turn "/api/waste/:id" into a matcher.
const routeMatches = (method, url) => {
	const clean = url.split("?")[0].replace(/\/+$/, "") || "/";
	return routes.some((r) => {
		if (r.method !== method) return false;
		const rp = r.path.replace(/\/+$/, "") || "/";
		const rx = new RegExp(
			"^" +
				rp
					.split("/")
					.map((seg) => (seg.startsWith(":") ? "[^/]+" : seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
					.join("/") +
				"$"
		);
		return rx.test(clean);
	});
};

console.log(`\n=== 0. Route table: ${routes.length} routes across ${new Set(routes.map((r) => r.file)).size} files ===`);

// ── Sections under review ───────────────────────────────────────────────────
// label, url fragment that identifies calls belonging to this section
const SECTIONS = [
	["Waste Management", "/waste"],
	["Promo Codes", "/promocodes"],
	["Announcements", "/announcements"],
	["For Kitchens", "/kitchens"],
	["Kitchen Categories", "/kitchen-categories"],
	["Settings", "/settings"],
	["Profile", "/auth/profile"],
	["Backup", "/backup"],
];

// Collections nested under a named key in the response.
const WRAPPED_LIST_KEYS = {
	"/waste": "waste",
	"/promocodes": "promoCodes",
	"/announcements": "announcements",
	"/kitchens": "kitchens",
	"/kitchen-categories": "categories",
};

const PAGES = ["page-dashboard.js", "page-market-dashboard.js"];

// ── 1. Every call the pages make resolves to a real route ───────────────────
console.log("\n=== 1. Frontend calls resolve to real routes ===\n");

// Collect (page, line, method, url) for every fetch in the section scope.
const calls = [];
for (const page of PAGES) {
	const full = path.join(JS_DIR, page);
	if (!fs.existsSync(full)) continue;
	const lines = fs.readFileSync(full, "utf8").split("\n");

	lines.forEach((line, i) => {
		if (line.trim().startsWith("//") || line.trim().startsWith("*")) return;

		// `${API_BASE_URL}/waste/...`  or  authenticatedFetch('/api/waste/...')
		const urlM =
			line.match(/\$\{API_BASE_URL\}(\/[A-Za-z0-9\-_/${}.:]*)/) ||
			line.match(/authenticatedFetch\(\s*[`'"]\/api(\/[A-Za-z0-9\-_/${}.:]*)/) ||
			line.match(/fetch\(\s*[`'"]\/api(\/[A-Za-z0-9\-_/${}.:]*)/);
		if (!urlM) return;

		// Normalise template holes to a path param.
		const url = urlM[1].replace(/\$\{[^}]*\}/g, ":id").replace(/\/$/, "");

		// The verb: look on this line and the next few (method: "PUT").
		const ctx = lines.slice(i, i + 8).join("\n");
		const mM = ctx.match(/method:\s*[`'"](GET|POST|PUT|PATCH|DELETE)[`'"]/i);
		// `method: isEdit ? "PUT" : "POST"` — capture both.
		const ternary = ctx.match(
			/method:\s*[^,\n]*\?\s*[`'"](\w+)[`'"]\s*:\s*[`'"](\w+)[`'"]/
		);
		const methods = ternary
			? [ternary[1].toUpperCase(), ternary[2].toUpperCase()]
			: [mM ? mM[1].toUpperCase() : "GET"];

		for (const method of methods) {
			calls.push({ page, line: i + 1, method, url });
		}
	});
}

for (const [label, frag] of SECTIONS) {
	const mine = calls.filter((c) => c.url.startsWith(frag));
	if (mine.length === 0) {
		info(`${label}: no calls found on the dashboards`);
		continue;
	}
	const bad = [];
	for (const c of mine) {
		if (!routeMatches(c.method, "/api" + c.url)) {
			bad.push(c);
		}
	}
	if (bad.length) {
		for (const c of bad) {
			fail(
				`${label}: ${c.page}:${c.line} calls ${c.method} /api${c.url} — no such route`
			);
		}
	} else {
		const verbs = [...new Set(mine.map((c) => c.method))].sort().join(", ");
		pass(`${label}: ${mine.length} call(s) all resolve (${verbs})`);
	}
}

// ── 2. List responses are unwrapped correctly ───────────────────────────────
console.log("\n=== 2. List payloads are unwrapped (not read off the wrapper) ===\n");

for (const page of PAGES) {
	const full = path.join(JS_DIR, page);
	if (!fs.existsSync(full)) continue;
	const lines = fs.readFileSync(full, "utf8").split("\n");

	lines.forEach((line, i) => {
		if (line.trim().startsWith("//")) return;
		// A bare `.data` read used as a list.
		const bad =
			/(?:const|let|var)?\s*(\w+)\s*=\s*(?:result|data|json|j|payload)\.data\s*(?:\|\|\s*\[\])?\s*;/.exec(
				line
			) ||
			/Array\.isArray\(\s*(?:result|data|json|j|payload)\.data\s*\)\s*\?/.exec(line);
		if (!bad) return;

		const ctx = lines.slice(Math.max(0, i - 15), i).join("\n");
		for (const [frag, key] of Object.entries(WRAPPED_LIST_KEYS)) {
			// Only a LIST call (no /:id), i.e. the fragment not followed by a param.
			const listCall = new RegExp(
				frag.replace(/[-/]/g, "\\$&") + "(?:\\?|`|'|\"|\\s)"
			);
			if (listCall.test(ctx)) {
				fail(
					`${page}:${i + 1} reads .data after ${frag} — payload nests "${key}"`
				);
				break;
			}
		}
	});
}
if (failures === 0) pass("no list read takes the wrapper for the array");

// ── 3. Create/update/delete refresh the list afterwards ─────────────────────
console.log("\n=== 3. Mutations refresh their list ===\n");

const MUTATIONS = [
	// page function name regex, expected reload call
	[/async function saveWaste\b/, /loadWaste/],
	[/async function deleteWaste\b/, /loadWaste/],
	[/async function savePromoCode\b/, /loadPromoCodes/],
	[/async function deletePromoCode\b/, /loadPromoCodes/],
	[/async function saveAnnouncement\b/, /loadAnnouncements/],
	[/async function deleteAnnouncement\b/, /loadAnnouncements/],
	[/async function saveKitchen\b/, /loadKitchens/],
	[/async function deleteKitchen\b/, /loadKitchens/],
	[/async function saveKitchenCategory\b/, /loadKitchenCategories/],
	[/async function deleteKitchenCategory\b/, /loadKitchenCategories/],
];

for (const page of PAGES) {
	const full = path.join(JS_DIR, page);
	if (!fs.existsSync(full)) continue;
	const src = fs.readFileSync(full, "utf8");

	for (const [fnRe, reloadRe] of MUTATIONS) {
		const m = fnRe.exec(src);
		if (!m) continue;
		// Take the function body: from the match to the next top-level `\n\t\t\t}`.
		const body = src.slice(m.index, m.index + 4000);
		if (!reloadRe.test(body)) {
			fail(
				`${page}: ${fnRe.source.replace(/\\b|async function /g, "")} ` +
					`never calls ${reloadRe.source} — list will look stale`
			);
		}
	}
}
if (failures === 0) pass("every mutation refreshes its list");

console.log(
	failures === 0 ? "\nALL CHECKS PASSED\n" : `\n${failures} CHECK(S) FAILED\n`
);
process.exit(failures === 0 ? 0 : 1);
