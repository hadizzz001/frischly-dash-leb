/*
 * Freshly.lb — audit: elements hidden by an EXTRACTED CSS class that JS then
 * tries to reveal via inline style.
 *
 * Background
 * ----------
 * The automated inline-style extraction turned  style="display:none"  into
 * utility classes (.dsx-N / .mdx-N). That silently broke two things:
 *
 *   1. `el.style.display = ""`  used to mean "drop the inline display:none and
 *      become visible". Now the class still hides the element, so it stays
 *      invisible forever. (This is what hid "Market Management".)
 *
 *   2. Classes extracted as `display: none !important` can't be overridden by
 *      ANY inline style, so even `el.style.display = "block"` fails.
 *
 * This audit fails on both patterns so they can't come back.
 */
const fs = require("fs");
const path = require("path");

const PUB = path.join(__dirname, "..", "public");
const CSS = path.join(PUB, "css");

let failures = 0;
const fail = (m) => {
	failures++;
	console.log("  FAIL  " + m);
};
const pass = (m) => console.log("  PASS  " + m);

// ── 1. Collect every class whose ONLY job is to hide an element ──────────────
const hideClasses = new Map(); // class -> { important, file }
for (const file of fs.readdirSync(CSS).filter((f) => f.endsWith(".css"))) {
	const css = fs.readFileSync(path.join(CSS, file), "utf8");
	const re = /\.([A-Za-z0-9_-]+)\s*\{([^}]*)\}/g;
	for (const m of css.matchAll(re)) {
		const body = m[2];
		if (!/display\s*:\s*none/i.test(body)) continue;
		// Only utility-style rules (a single display declaration).
		const decls = body.split(";").filter((d) => d.trim());
		if (decls.length !== 1) continue;
		hideClasses.set(m[1], {
			important: /!\s*important/i.test(body),
			file,
		});
	}
}
console.log(
	`\n=== 1. Hiding utility classes found: ${hideClasses.size} ===\n` +
		`  (e.g. ${[...hideClasses.keys()].slice(0, 6).join(", ")})`
);

// ── 2. Map element id -> hiding classes it carries, per page ─────────────────
console.log("\n=== 2. Elements hidden by class, revealed by inline style ===\n");

const pages = fs.readdirSync(PUB).filter((f) => f.endsWith(".html"));

for (const page of pages) {
	const html = fs.readFileSync(path.join(PUB, page), "utf8");

	// The page's own JS bundle (page-<name>.js), if it has one.
	const jsName = "page-" + page.replace(/\.html$/, "") + ".js";
	const jsPath = path.join(PUB, "js", jsName);
	if (!fs.existsSync(jsPath)) continue;
	const js = fs.readFileSync(jsPath, "utf8");

	// Every tag that has both a class list and an id.
	const tagRe = /<[a-z]+[^>]*\bclass="([^"]*)"[^>]*\bid="([^"]+)"[^>]*>/gi;
	const tagRe2 = /<[a-z]+[^>]*\bid="([^"]+)"[^>]*\bclass="([^"]*)"[^>]*>/gi;
	const found = [];
	for (const m of html.matchAll(tagRe)) found.push([m[2], m[1]]);
	for (const m of html.matchAll(tagRe2)) found.push([m[1], m[2]]);

	for (const [id, classList] of found) {
		const hiders = classList
			.split(/\s+/)
			.filter((c) => hideClasses.has(c));
		if (!hiders.length) continue;

		// Does the JS try to control this element's display?
		const idRe = new RegExp(
			`getElementById\\(\\s*["'\`]${id}["'\`]\\s*\\)`
		);
		if (!idRe.test(js)) continue;

		// Find the assignments made to it.
		const assignRe = new RegExp(
			`["'\`]${id}["'\`][\\s\\S]{0,400}?\\.style\\.display\\s*=\\s*([^;\\n]+)`,
			"g"
		);
		const assigns = [...js.matchAll(assignRe)].map((m) => m[1].trim());
		if (!assigns.length) continue;

		for (const cls of hiders) {
			const info = hideClasses.get(cls);
			if (info.important) {
				fail(
					`${page} #${id}: hidden by .${cls} {display:none !important} ` +
						`(${info.file}) — inline style can NEVER reveal it`
				);
			} else if (assigns.some((a) => /^(""|''|``)$/.test(a))) {
				fail(
					`${page} #${id}: JS sets display="" to reveal, but .${cls} ` +
						`(${info.file}) keeps it hidden`
				);
			}
		}
	}
}
if (failures === 0) pass("no element is trapped hidden by an extracted class");

// ── 3. The sidebar must expose Market Management to admins ──────────────────
console.log("\n=== 3. Sidebar: Market Management reachable for admin ===\n");

for (const page of ["dashboard.html", "market-dashboard.html"]) {
	const html = fs.readFileSync(path.join(PUB, page), "utf8");
	const m = html.match(
		/<li[^>]*\bid="markets-menu-item"[^>]*>/i
	);
	if (!m) {
		fail(`${page}: markets-menu-item is MISSING from the sidebar`);
		continue;
	}
	const tag = m[0];
	const cls = (tag.match(/class="([^"]*)"/) || [, ""])[1];
	const stuck = cls.split(/\s+/).filter((c) => hideClasses.has(c));
	if (stuck.length) {
		fail(`${page}: markets-menu-item carries hiding class .${stuck.join(", .")}`);
	} else if (/style="[^"]*display\s*:\s*none/i.test(tag)) {
		pass(`${page}: hidden inline (JS can clear it) — OK`);
	} else {
		pass(`${page}: not hidden by a stuck class`);
	}

	if (!/href="\/markets"/.test(html)) {
		fail(`${page}: no link to /markets`);
	}
}

// ── 4. The admin market pages still exist and are wired up ──────────────────
console.log("\n=== 4. Market management pages intact ===\n");

const REQUIRED = [
	["markets.html", "js/page-markets.js"],
	["market-manage.html", "js/page-market-manage.js"],
	["market-products.html", "js/page-market-products.js"],
	["market-orders.html", "js/page-market-orders.js"],
];
for (const [pageFile, script] of REQUIRED) {
	const p = path.join(PUB, pageFile);
	if (!fs.existsSync(p)) {
		fail(`${pageFile} is MISSING`);
		continue;
	}
	const html = fs.readFileSync(p, "utf8");
	if (!fs.existsSync(path.join(PUB, script))) {
		fail(`${script} is MISSING (referenced by ${pageFile})`);
	} else if (!html.includes(script)) {
		fail(`${pageFile} does not load ${script}`);
	} else {
		pass(`${pageFile} + ${script}`);
	}
	// Each admin page renders the shared sidebar.
	if (!html.includes("admin-sidebar.js")) {
		fail(`${pageFile} does not include the shared admin sidebar`);
	}
	if (!html.includes('id="admin-sidebar-menu"')) {
		fail(`${pageFile} has no #admin-sidebar-menu container to render into`);
	}
}

// ── 5. Shared sidebar must match the dashboard's menu ───────────────────────
console.log("\n=== 5. Shared sidebar matches the dashboard menu ===\n");

const sidebarJs = fs.readFileSync(path.join(PUB, "js", "admin-sidebar.js"), "utf8");
const sidebarKeys = [...sidebarJs.matchAll(/key:\s*"([a-z]+)"/g)].map((m) => m[1]);
const dashHtml = fs.readFileSync(path.join(PUB, "dashboard.html"), "utf8");
const dashKeys = [...dashHtml.matchAll(/id="menu-([a-z]+)"/g)].map((m) => m[1]);

const missing = dashKeys.filter((k) => !sidebarKeys.includes(k));
const extra = sidebarKeys.filter((k) => !dashKeys.includes(k));
if (missing.length) fail(`shared sidebar is missing: ${missing.join(", ")}`);
if (extra.length) fail(`shared sidebar has unknown items: ${extra.join(", ")}`);
if (!missing.length && !extra.length) {
	pass(`shared sidebar matches the dashboard (${sidebarKeys.length} items)`);
}
if (!sidebarKeys.includes("markets")) fail("shared sidebar lost Market Management");

console.log(
	failures === 0 ? "\nALL CHECKS PASSED\n" : `\n${failures} CHECK(S) FAILED\n`
);
process.exit(failures === 0 ? 0 : 1);
