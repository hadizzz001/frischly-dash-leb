/**
 * Structural audit of the dashboard section containers.
 *
 * showSection() reveals a panel with `classList.add("active")`, which only
 * works if the panel is a SIBLING at the top level of the content area. If one
 * ".content-section" ends up NESTED inside another, the inner one can never be
 * shown: its parent still has display:none, and no amount of class-toggling on
 * the child overrides a hidden ancestor.
 *
 * A single surplus </div> is enough to cause this, and it cascades — every
 * later container closes one level too early. Both dashboards are checked
 * because they are near-copies of each other.
 *
 *   node tests/_section-nesting-audit.js
 */
const fs = require("fs");
const path = require("path");

const failures = [];
const pass = (m) => console.log(`  PASS  ${m}`);
const fail = (m) => {
	console.log(`  FAIL  ${m}`);
	failures.push(m);
};

const PAGES = ["dashboard.html", "market-dashboard.html"];

for (const page of PAGES) {
	const file = path.join(__dirname, "..", "public", page);
	if (!fs.existsSync(file)) continue;
	console.log(`\n########## ${page} ##########`);
	auditPage(fs.readFileSync(file, "utf8"));
}

function auditPage(html) {

// Walk every <div ...> / </div> in order, tracking depth, and record the depth
// at which each .content-section opens plus which one encloses it.
const tagRe = /<div\b([^>]*)>|<\/div\s*>/gi;
const stack = [];
const sections = [];
const strayCloses = [];
let m;

while ((m = tagRe.exec(html)) !== null) {
	const isOpen = m[0][1] !== "/";
	// Self-closing divs are invalid HTML but guard anyway.
	if (isOpen) {
		const attrs = m[1] || "";
		const idMatch = attrs.match(/id\s*=\s*"([^"]*)"/i);
		const classMatch = attrs.match(/class\s*=\s*"([^"]*)"/i);
		const isSection =
			classMatch && /\bcontent-section\b/.test(classMatch[1]);
		const line = html.slice(0, m.index).split("\n").length;
		const node = {
			id: idMatch ? idMatch[1] : null,
			isSection,
			line,
		};
		if (isSection) {
			const enclosing = stack.filter((n) => n.isSection).pop() || null;
			sections.push({ ...node, enclosing, depth: stack.length });
		}
		stack.push(node);
	} else if (stack.length === 0) {
		// A </div> with nothing open. Popping an empty stack silently would
		// make an over-closed document look perfectly balanced.
		strayCloses.push(html.slice(0, m.index).split("\n").length);
	} else {
		stack.pop();
	}
}

console.log(`\n=== ${sections.length} .content-section element(s) ===\n`);

const nested = sections.filter((s) => s.enclosing);
for (const s of sections) {
	const where = s.enclosing
		? `NESTED inside #${s.enclosing.id} (line ${s.enclosing.line})`
		: "top level";
	console.log(`  line ${String(s.line).padEnd(6)} #${(s.id || "(no id)").padEnd(28)} ${where}`);
}
console.log("");

if (nested.length === 0) {
	pass("no .content-section is nested inside another");
} else {
	for (const s of nested) {
		fail(
			`#${s.id} (line ${s.line}) is nested inside #${s.enclosing.id} — it can never be displayed`
		);
	}
}

// Unclosed/extra tags anywhere in the document skew the whole tree.
if (stack.length === 0) {
	pass("no unclosed <div> tags");
} else {
	fail(`${stack.length} unclosed <div> tag(s); first at line ${stack[0].line}`);
}

if (strayCloses.length === 0) {
	pass("no stray </div> tags");
} else {
	fail(
		`${strayCloses.length} stray </div> tag(s) with nothing open; first at line ${strayCloses[0]}`
	);
}

// Every section should sit at the same nesting depth — a section that lives in
// a different parent than its peers is a sign the tree drifted.
const depths = [...new Set(sections.map((s) => s.depth))];
if (depths.length === 1) {
	pass(`all sections share nesting depth ${depths[0]}`);
} else {
	console.log(
		`  NOTE  sections sit at mixed depths (${depths.join(
			", "
		)}) — they still display, but the container tree is uneven`
	);
}

// --- sidebar <-> section cross-check -------------------------------------
const menuKeys = [...html.matchAll(/showSection\('([^']+)'\)"\s+id="menu-([^"]+)"/g)].map(
	(x) => x[1]
);
console.log(`=== ${menuKeys.length} sidebar menu item(s) ===\n`);
const sectionIds = new Set(sections.map((s) => s.id));
	for (const key of menuKeys) {
		const expected = `${key}-section`;
		if (sectionIds.has(expected)) pass(`menu "${key}" -> #${expected}`);
		else fail(`menu "${key}" points at #${expected}, which does not exist`);
	}
}

// --- every section must actually load its data when opened ----------------
// A structurally visible panel that never fetches anything still looks broken,
// so check each menu key has a branch in loadSectionData() and that the
// function it calls is defined somewhere in the same file.
for (const [page, script] of [
	["dashboard.html", "page-dashboard.js"],
	["market-dashboard.html", "page-market-dashboard.js"],
]) {
	const htmlPath = path.join(__dirname, "..", "public", page);
	const jsPath = path.join(__dirname, "..", "public", "js", script);
	if (!fs.existsSync(htmlPath) || !fs.existsSync(jsPath)) continue;

	console.log(`\n########## ${script} — section loaders ##########`);
	const pageHtml = fs.readFileSync(htmlPath, "utf8");
	const js = fs.readFileSync(jsPath, "utf8");
	const keys = [
		...new Set(
			[...pageHtml.matchAll(/showSection\('([^']+)'\)/g)].map((x) => x[1])
		),
	];

	const body = (js.match(/function loadSectionData[\s\S]*?\n\t*\}/) || [""])[0];
	// Language keywords and globals are not "loader functions" — without this
	// blocklist the matcher flags `if (`, `setTimeout(` and words inside
	// comments, which produces pure noise.
	const NOT_LOADERS = new Set([
		"if",
		"for",
		"while",
		"switch",
		"catch",
		"return",
		"typeof",
		"setTimeout",
		"setInterval",
		"parseInt",
		"parseFloat",
		"String",
		"Number",
		"Boolean",
		"Array",
		"Object",
		"JSON",
		"console",
	]);
	for (const key of keys) {
		if (!new RegExp(`case\\s+"${key}"`).test(js)) {
			fail(`${script}: no loadSectionData branch for "${key}"`);
			continue;
		}
		const rawBranch = (js.match(
			new RegExp(`case\\s+"${key}":([\\s\\S]*?)break;`)
		) || ["", ""])[1];
		// Strip comments so prose like "Load promo tab (own company)" is ignored.
		const branch = rawBranch
			.replace(/\/\*[\s\S]*?\*\//g, "")
			.replace(/\/\/[^\n]*/g, "");
		const called = [
			...new Set(
				[...branch.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)]
					.map((x) => x[1])
					.filter((fn) => !NOT_LOADERS.has(fn))
			),
		];
		const missing = called.filter(
			(fn) =>
				!new RegExp(
					`function\\s+${fn}\\b|\\b${fn}\\s*=\\s*(async\\s*)?(function|\\()`
				).test(js)
		);
		if (missing.length) {
			fail(`${script}: "${key}" calls undefined ${missing.join(", ")}`);
		} else {
			pass(`${script}: "${key}" -> ${called.join(", ") || "(no loader call)"}`);
		}
	}
	void body;
}

console.log(
	failures.length === 0
		? "\nALL CHECKS PASSED\n"
		: `\n${failures.length} CHECK(S) FAILED\n`
);
process.exit(failures.length === 0 ? 0 : 1);
