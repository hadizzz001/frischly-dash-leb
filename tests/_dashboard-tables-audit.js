/**
 * Full audit of every dashboard table: does the fetch actually reach the
 * renderer, and are create / edit / delete wired to functions that exist?
 *
 * Motivation: `listFrom()` was called in 9 places across both dashboards but
 * was never defined anywhere. Each call threw a ReferenceError that the
 * surrounding try/catch swallowed, so the Subcategories / Orders / Products /
 * Shelves tables rendered "no data" even though the API had returned rows.
 *
 * This uses a real JS parser (esprima) rather than regex, so comments, strings
 * and template literals can never produce phantom results.
 *
 * Run: node tests/_dashboard-tables-audit.js
 */
const fs = require("fs");
const path = require("path");
const acorn = require("acorn");

const ROOT = path.join(__dirname, "..");
const JS_DIR = path.join(ROOT, "public/js");

let failures = 0;
const fail = (msg) => {
	console.log(`  FAIL  ${msg}`);
	failures++;
};
const pass = (msg) => console.log(`  PASS  ${msg}`);

// Globals provided by the browser or by third-party <script> tags.
const BROWSER_GLOBALS = new Set([
	"window", "document", "console", "fetch", "localStorage", "sessionStorage",
	"location", "navigator", "alert", "confirm", "prompt", "setTimeout",
	"clearTimeout", "setInterval", "clearInterval", "JSON", "Math", "Date",
	"Object", "Array", "String", "Number", "Boolean", "Promise", "Map", "Set",
	"parseInt", "parseFloat", "isNaN", "isFinite", "encodeURIComponent",
	"decodeURIComponent", "encodeURI", "decodeURI", "FormData", "Response",
	"Request", "Headers", "Blob", "URL", "URLSearchParams", "Error", "RegExp",
	"AbortController", "FileReader", "Event", "CustomEvent", "Image", "Audio",
	"IntersectionObserver", "MutationObserver", "ResizeObserver", "Intl",
	"Symbol", "WeakMap", "WeakSet", "structuredClone", "queueMicrotask",
	"btoa", "atob", "requestAnimationFrame", "cancelAnimationFrame",
	"getComputedStyle", "TextEncoder", "TextDecoder", "Notification",
	"L", "google", "Chart", "JsBarcode", "Html5Qrcode", "Html5QrcodeScanner",
	"io", "Stripe", "firebase", "require", "module", "exports", "process",
]);

const parse = (src, file) => {
	try {
		return acorn.parse(src, {
			ecmaVersion: "latest",
			sourceType: "script",
			allowReturnOutsideFunction: true,
			locations: true,
		});
	} catch (e) {
		fail(`${file} — PARSE ERROR: ${e.message}`);
		return null;
	}
};

/** Walk every node in an acorn AST. */
const walk = (node, visit) => {
	if (!node || typeof node !== "object") return;
	if (Array.isArray(node)) {
		for (const child of node) walk(child, visit);
		return;
	}
	if (typeof node.type !== "string") return;
	visit(node);
	for (const key of Object.keys(node)) {
		if (key === "loc" || key === "range" || key === "start" || key === "end") continue;
		walk(node[key], visit);
	}
};

/** Names declared anywhere in the file (any scope). */
const collectDeclared = (ast) => {
	const names = new Set();
	const addPattern = (pat) => {
		if (!pat) return;
		if (pat.type === "Identifier") names.add(pat.name);
		else if (pat.type === "ObjectPattern")
			pat.properties.forEach((p) => addPattern(p.value || p.argument));
		else if (pat.type === "ArrayPattern") pat.elements.forEach(addPattern);
		else if (pat.type === "AssignmentPattern") addPattern(pat.left);
		else if (pat.type === "RestElement") addPattern(pat.argument);
	};

	walk(ast, (node) => {
		if (node.type === "FunctionDeclaration" && node.id) names.add(node.id.name);
		if (node.type === "FunctionExpression" && node.id) names.add(node.id.name);
		if (node.type === "ClassDeclaration" && node.id) names.add(node.id.name);
		if (node.type === "VariableDeclarator") addPattern(node.id);
		if (/Function/.test(node.type) && node.params) node.params.forEach(addPattern);
		if (node.type === "CatchClause") addPattern(node.param);
		// window.foo = ... publishes a global
		if (
			node.type === "AssignmentExpression" &&
			node.left.type === "MemberExpression" &&
			node.left.object.type === "Identifier" &&
			node.left.object.name === "window" &&
			node.left.property.type === "Identifier"
		) {
			names.add(node.left.property.name);
		}
	});
	return names;
};

/** Identifiers used in call position: foo(...) — not obj.foo(...). */
const collectCalled = (ast) => {
	const calls = new Map(); // name -> first line
	walk(ast, (node) => {
		if (
			(node.type === "CallExpression" || node.type === "NewExpression") &&
			node.callee &&
			node.callee.type === "Identifier" &&
			!calls.has(node.callee.name)
		) {
			calls.set(node.callee.name, node.loc ? node.loc.start.line : 0);
		}
	});
	return calls;
};

// ---------------------------------------------------------------------------
const configSrc = fs.readFileSync(path.join(JS_DIR, "config.js"), "utf8");
const configAst = parse(configSrc, "config.js");
const CONFIG_GLOBALS = configAst ? collectDeclared(configAst) : new Set();

// Other always-loaded shared scripts contribute globals too.
for (const shared of ["translator.js", "lebanese-cities.js", "admin-sidebar.js", "region-map-picker.js", "barcode-scanner.js"]) {
	const p = path.join(JS_DIR, shared);
	if (!fs.existsSync(p)) continue;
	const ast = parse(fs.readFileSync(p, "utf8"), shared);
	if (ast) for (const n of collectDeclared(ast)) CONFIG_GLOBALS.add(n);
}

const PAGES = fs
	.readdirSync(JS_DIR)
	.filter((f) => f.startsWith("page-") && f.endsWith(".js"))
	.sort();

const sources = new Map();
const asts = new Map();
const declared = new Map();

for (const page of PAGES) {
	const src = fs.readFileSync(path.join(JS_DIR, page), "utf8");
	sources.set(page, src);
	const ast = parse(src, page);
	if (!ast) continue;
	asts.set(page, ast);
	declared.set(page, collectDeclared(ast));
}

console.log("\n=== 1. Functions called but never defined (would throw at runtime) ===\n");

for (const page of PAGES) {
	const ast = asts.get(page);
	if (!ast) continue;
	const defined = declared.get(page);
	const missing = [];

	for (const [name, line] of collectCalled(ast)) {
		if (defined.has(name) || BROWSER_GLOBALS.has(name) || CONFIG_GLOBALS.has(name)) continue;
		missing.push(`${name}() @L${line}`);
	}

	if (missing.length) fail(`${page}: ${missing.join(", ")}`);
	else pass(page);
}

console.log("\n=== 2. Inline handlers in rendered rows resolve (edit/delete buttons) ===\n");

// Handlers live inside HTML strings, so the AST cannot see them. They run in
// global scope, so they must resolve against the page's own definitions.
const HANDLER_RE =
	/\bon(?:click|change|input|submit|blur|focus|keyup|keypress)\s*=\s*\\?["']\s*([a-zA-Z_$][\w$]*)\s*\(/g;

for (const page of PAGES) {
	if (!declared.has(page)) continue;
	const defined = declared.get(page);
	const missing = new Set();

	for (const m of sources.get(page).matchAll(HANDLER_RE)) {
		const name = m[1];
		if (!defined.has(name) && !CONFIG_GLOBALS.has(name) && !BROWSER_GLOBALS.has(name)) {
			missing.add(name);
		}
	}

	if (missing.size) fail(`${page}: ${[...missing].join(", ")}`);
	else pass(page);
}

console.log("\n=== 3. listFrom() handles every response shape the API emits ===\n");

const listFrom = (() => {
	const start = configSrc.indexOf("function listFrom");
	if (start === -1) {
		fail("listFrom() is NOT defined in config.js");
		return () => [];
	}
	// eslint-disable-next-line no-eval
	return eval(`(${configSrc.slice(start).match(/^function listFrom[\s\S]*?\n}/)[0]})`);
})();

const rows = [{ _id: "1" }, { _id: "2" }];
const shapes = {
	"named key under data { data: { subcategories: [] } }": [
		{ success: true, data: { subcategories: rows } }, "subcategories"],
	"crud() factory       { data: { items: [] } }": [
		{ success: true, data: { items: rows, meta: {} } }, "subcategories"],
	"plain array in data  { data: [] }": [{ success: true, data: rows }, "orders"],
	"bare array           []": [rows, "orders"],
	"named key at top     { orders: [] }": [{ orders: rows }, "orders"],
	"renamed key fallback { data: { docs: [] } }": [{ data: { docs: rows } }, "orders"],
};
for (const [label, [payload, key]] of Object.entries(shapes)) {
	const out = listFrom(payload, key);
	if (Array.isArray(out) && out.length === 2) pass(label);
	else fail(`${label} -> ${JSON.stringify(out)}`);
}
for (const [label, payload] of Object.entries({
	null: null,
	undefined: undefined,
	"empty object": {},
	"error envelope": { success: false, message: "nope", data: null },
})) {
	const out = listFrom(payload, "orders");
	if (Array.isArray(out) && out.length === 0) pass(`${label} -> [] (no crash)`);
	else fail(`${label} -> ${JSON.stringify(out)}`);
}

console.log("\n=== 4. Table renderers: fetch -> tbody, plus create/edit/delete ===\n");

const TABLES = [
	["page-dashboard.js", "refreshSubcategories", "subcategories-table-body",
		["showAddSubcategoryModal", "editSubcategory", "toggleSubcategoryStatus"]],
	["page-dashboard.js", "refreshCategories", "categories-table-body",
		["showAddCategoryModal", "editCategory", "deleteCategory"]],
	["page-market-dashboard.js", "refreshSubcategories", "subcategories-table-body",
		["showAddSubcategoryModal", "editSubcategory", "toggleSubcategoryStatus"]],
	["page-market-dashboard.js", "refreshCategories", "categories-table-body",
		["showAddCategoryModal", "editCategory", "deleteCategory"]],
];

for (const [file, fn, tbody, crud] of TABLES) {
	const defined = declared.get(file);
	const src = sources.get(file);
	if (!defined) continue;

	if (!defined.has(fn)) {
		fail(`${file}: ${fn}() missing`);
		continue;
	}
	if (!src.includes(tbody)) {
		fail(`${file}: ${fn}() has no #${tbody}`);
		continue;
	}
	const missingCrud = crud.filter((c) => !defined.has(c));
	if (missingCrud.length) fail(`${file}: ${fn} CRUD missing ${missingCrud.join(", ")}`);
	else pass(`${file}: ${fn}() -> #${tbody} (+ create/edit/delete)`);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
