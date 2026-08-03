/*
 * Freshly.lb — audit: does the market dashboard call routes a market token is
 * actually allowed to use?
 *
 * Market accounts authenticate as `isMarket` with role "market". Many API
 * routes are guarded by `authorize("admin")`, which rejects that role with a
 * 403. When the market dashboard calls one of those, the section renders
 * nothing at all — and because the failure is a clean 403 rather than an
 * exception, no error surfaces anywhere obvious.
 *
 * This is exactly how the market Promo Codes section broke: it called
 * /api/promocodes (admin-only) instead of /api/market-admin/promocodes.
 *
 * Run:  node tests/_market-route-access-audit.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ROUTES_DIR = path.join(ROOT, "src", "routes");
const PAGE = path.join(ROOT, "public", "js", "page-market-dashboard.js");

let failures = 0;
const fail = (m) => {
	failures++;
	console.log("  FAIL  " + m);
};
const pass = (m) => console.log("  PASS  " + m);

// Roles a market account can present.
const MARKET_ROLES = ["market", "market_manager", "market_staff"];

// ── Build the route table with the roles each route permits ────────────────
const serverSrc = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
const mounts = {};
for (const m of serverSrc.matchAll(
	/app\.use\(\s*"(\/api\/[^"]+)"\s*,\s*(\w+)\s*\)/g
)) {
	mounts[m[2]] = m[1];
}
const varToFile = {};
for (const m of serverSrc.matchAll(
	/const\s+(\w+)\s*=\s*require\(\s*"\.\/src\/routes\/([\w-]+)"\s*\)/g
)) {
	varToFile[m[1]] = m[2] + ".js";
}

const routes = [];
for (const [varName, mount] of Object.entries(mounts)) {
	const file = varToFile[varName];
	if (!file) continue;
	const p = path.join(ROUTES_DIR, file);
	if (!fs.existsSync(p)) continue;
	const src = fs.readFileSync(p, "utf8");

	// A file-level `router.use(authorize(...))` applies to everything after it.
	const blanket = [];
	for (const m of src.matchAll(/router\.use\(\s*authorize\(([^)]*)\)/g)) {
		blanket.push({
			index: m.index,
			roles: [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]),
		});
	}
	// `router.use(protect, marketOnly)` means market-only, which is fine.
	const marketOnly = /router\.use\([^)]*marketOnly/.test(src);

	const rolesAt = (index) => {
		if (marketOnly) return MARKET_ROLES;
		const applicable = blanket.filter((b) => b.index < index);
		if (!applicable.length) return null; // no restriction found
		return applicable[applicable.length - 1].roles;
	};

	const add = (method, sub, index, inlineRoles) => {
		routes.push({
			method,
			path: mount + (sub === "/" ? "" : sub),
			roles: inlineRoles || rolesAt(index),
			file,
		});
	};

	// Style A: router.get("/x", protect, authorize("admin"), handler)
	for (const m of src.matchAll(
		/router\s*\.\s*(get|post|put|patch|delete)\s*\(\s*"([^"]*)"([\s\S]{0,300}?)\)\s*;/g
	)) {
		const inline = m[3].match(/authorize\(([^)]*)\)/);
		add(
			m[1].toUpperCase(),
			m[2],
			m.index,
			inline ? [...inline[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : null
		);
	}

	// Style B: router.route("/x").get(...).post(...)
	for (const m of src.matchAll(/router\s*\.\s*route\s*\(\s*"([^"]*)"\s*\)/g)) {
		const rest = src.slice(m.index + m[0].length);
		const chain = rest.slice(0, rest.indexOf(";") + 1);
		for (const v of chain.matchAll(
			/\.\s*(get|post|put|patch|delete)\s*\(([\s\S]{0,200}?)\)/g
		)) {
			const inline = v[2].match(/authorize\(([^)]*)\)/);
			add(
				v[1].toUpperCase(),
				m[1],
				m.index,
				inline ? [...inline[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : null
			);
		}
	}
}

const findRoute = (method, url) => {
	const clean = url.split("?")[0].replace(/\/+$/, "") || "/";
	return routes.find((r) => {
		if (r.method !== method) return false;
		const rp = r.path.replace(/\/+$/, "") || "/";
		const rx = new RegExp(
			"^" +
				rp
					.split("/")
					.map((s) =>
						s.startsWith(":") ? "[^/]+" : s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
					)
					.join("/") +
				"$"
		);
		return rx.test(clean);
	});
};

console.log(`\n=== Market dashboard calls vs route permissions ===\n`);
console.log(`  (route table: ${routes.length} routes)\n`);

const lines = fs.readFileSync(PAGE, "utf8").split("\n");
const seen = new Set();

lines.forEach((line, i) => {
	if (line.trim().startsWith("//") || line.trim().startsWith("*")) return;
	const m =
		line.match(/\$\{API_BASE_URL\}(\/[A-Za-z0-9\-_/${}.:]*)/) ||
		line.match(/authenticatedFetch\(\s*[`'"]\/api(\/[A-Za-z0-9\-_/${}.:]*)/);
	if (!m) return;

	const url = m[1].replace(/\$\{[^}]*\}/g, ":id").replace(/\/$/, "");
	const ctx = lines.slice(i, i + 8).join("\n");
	const mm = ctx.match(/method:\s*[`'"](GET|POST|PUT|PATCH|DELETE)[`'"]/i);
	const tern = ctx.match(
		/method:\s*[^,\n]*\?\s*[`'"](\w+)[`'"]\s*:\s*[`'"](\w+)[`'"]/
	);
	const methods = tern
		? [tern[1].toUpperCase(), tern[2].toUpperCase()]
		: [mm ? mm[1].toUpperCase() : "GET"];

	for (const method of methods) {
		const r = findRoute(method, "/api" + url);
		if (!r) continue; // route-existence is covered by the CRUD audit
		if (!r.roles) continue; // no authorize() restriction
		const allowed = r.roles.some((role) => MARKET_ROLES.includes(role));
		if (allowed) continue;

		const key = `${method} ${url}`;
		if (seen.has(key)) continue;
		seen.add(key);

		fail(
			`line ${i + 1}: ${method} /api${url} allows [${r.roles.join(", ")}] — ` +
				`a market token gets 403, so this section renders nothing`
		);
	}
});

if (failures === 0) pass("every market dashboard call is permitted for market roles");

console.log(
	failures === 0 ? "\nALL CHECKS PASSED\n" : `\n${failures} CHECK(S) FAILED\n`
);
process.exit(failures === 0 ? 0 : 1);
