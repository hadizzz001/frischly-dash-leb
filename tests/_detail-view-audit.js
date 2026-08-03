/**
 * Detects the "detail view shows nothing / throws on .name" bug class.
 *
 * Most detail endpoints wrap their record under a named key:
 *     GET /orders/:id  ->  { data: { order: {...} } }
 * Several pages passed `result.data` (the WRAPPER) straight into the render
 * function, which then read `order.customer.name` on the wrapper and threw
 *     "Cannot read properties of undefined (reading 'name')"
 *
 * This test cross-references, for every detail endpoint:
 *   backend: which key does the controller wrap the record in?
 *   frontend: does the caller unwrap that key before rendering?
 *
 * Run: node tests/_detail-view-audit.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const JS_DIR = path.join(ROOT, "public/js");
const CTRL_DIR = path.join(ROOT, "src/controllers");

let failures = 0;
const fail = (m) => {
	console.log(`  FAIL  ${m}`);
	failures++;
};
const pass = (m) => console.log(`  PASS  ${m}`);

console.log("\n=== 1. Backend: endpoints that wrap a single record ===\n");

// const ras = { order };  ->  the record lives at data.order
const wrapped = new Map(); // key -> [controller files]
for (const file of fs.readdirSync(CTRL_DIR).filter((f) => f.endsWith(".js"))) {
	const src = fs.readFileSync(path.join(CTRL_DIR, file), "utf8");
	for (const m of src.matchAll(/const ras = \{\s*([a-zA-Z]\w*)\s*\}/g)) {
		const key = m[1];
		if (!wrapped.has(key)) wrapped.set(key, new Set());
		wrapped.get(key).add(file);
	}
}
for (const [key, files] of [...wrapped].sort()) {
	console.log(`  data.${key.padEnd(14)} <- ${[...files].join(", ")}`);
}

console.log("\n=== 2. Frontend: detail reads that forget to unwrap ===\n");

// Renderers that consume a single record, and the wrapper key the API uses.
const RENDER_CALLS = [
	["showOrderDetails", "order"],
	["showOrderDetailsModal", "order"],
	["renderMarket", "market"],
];

// Detail endpoints whose response wraps the record under a named key. If a
// page fetches one of these and then reads `result.data` directly, every field
// resolves to undefined (or throws on a nested access like `.customer.name`).
const WRAPPED_ENDPOINTS = [
	["/riders/", "rider"],
	["/shelves/", "shelf"],
	["/promocodes/", "promoCode"],
	["/announcements/", "announcement"],
	["/orders/", "order"],
	["/markets/", "market"],
];

const pages = fs
	.readdirSync(JS_DIR)
	.filter((f) => f.startsWith("page-") && f.endsWith(".js"))
	.sort();

for (const page of pages) {
	const src = fs.readFileSync(path.join(JS_DIR, page), "utf8");
	for (const [fn, key] of RENDER_CALLS) {
		// Find call sites of the renderer (not its definition).
		const callRe = new RegExp(`(?<!function\\s)\\b${fn}\\s*\\(([^)]*)\\)`, "g");
		for (const m of src.matchAll(callRe)) {
			const arg = m[1].trim();
			if (!arg) continue;
			// Passing the raw envelope/wrapper is the bug.
			if (/^(result|data|response|json)\.data$/.test(arg)) {
				fail(`${page}: ${fn}(${arg}) passes the WRAPPER — should unwrap "${key}"`);
			} else if (/^(result|data)$/.test(arg)) {
				fail(`${page}: ${fn}(${arg}) passes the whole envelope`);
			}
		}
	}

	// Any `const x = result.data;` within 15 lines below a wrapped endpoint
	// fetch is reading the wrapper instead of the record.
	const lines = src.split("\n");
	lines.forEach((line, i) => {
		const bare = line.match(/const\s+(\w+)\s*=\s*(?:data|result|json)\.data;\s*$/);
		if (!bare) return;
		const ctx = lines.slice(Math.max(0, i - 15), i).join("\n");
		for (const [ep, key] of WRAPPED_ENDPOINTS) {
			// Only a template-interpolated id (`/orders/${x}`) is a detail
			// route. Literal sub-routes like `/orders/stats` return their own
			// bare object and must NOT be unwrapped.
			if (ctx.includes(ep + "${")) {
				fail(
					`${page}:${i + 1} "const ${bare[1]} = …data;" after ${ep} — ` +
						`must unwrap objectFrom(…, "${key}")`
				);
				break;
			}
		}
	});
}
if (failures === 0) pass("no detail view reads an un-unwrapped payload");

console.log("\n=== 3. objectFrom() unwraps every shape the API emits ===\n");

const configSrc = fs.readFileSync(path.join(JS_DIR, "config.js"), "utf8");
const start = configSrc.indexOf("function objectFrom");
if (start === -1) {
	fail("objectFrom() is NOT defined in config.js");
} else {
	// eslint-disable-next-line no-eval
	const objectFrom = eval(
		`(${configSrc.slice(start).match(/^function objectFrom[\s\S]*?\n}/)[0]})`
	);

	const rec = { _id: "1", customer: { name: "Ada" }, orderNumber: "ORD-1" };
	const cases = [
		["named key under data { data: { order } }", { success: true, data: { order: rec } }, "order", rec],
		["bare object under data { data: {...} }", { success: true, data: rec }, "order", rec],
		["key at top level     { order }", { order: rec }, "order", rec],
		["already unwrapped    {...}", rec, "order", rec],
		["wrong key falls back to data", { data: { rider: rec } }, "order", rec],
		["array payload -> first", [rec], "order", rec],
	];
	for (const [label, payload, key, expected] of cases) {
		const out = objectFrom(payload, key);
		out === expected || (out && out._id === expected._id)
			? pass(label)
			: fail(`${label} -> ${JSON.stringify(out)}`);
	}

	for (const [label, payload] of Object.entries({
		null: null,
		undefined: undefined,
		"error envelope": { success: false, message: "nope", data: null },
	})) {
		const out = objectFrom(payload, "order");
		out === null ? pass(`${label} -> null (no crash)`) : fail(`${label} -> ${JSON.stringify(out)}`);
	}

	// The exact regression: the old code passed the wrapper and read .customer.name
	const wrapper = { success: true, data: { order: rec } };
	const buggy = wrapper.data; // what the old code passed
	if (buggy.customer === undefined) pass("reproduced: wrapper has no .customer (the original crash)");
	else fail("wrapper unexpectedly has .customer");
	const fixed = objectFrom(wrapper, "order");
	fixed && fixed.customer && fixed.customer.name === "Ada"
		? pass("fixed: objectFrom yields the record with .customer.name")
		: fail("objectFrom did not recover the record");
}

console.log("\n=== 4. Order modal renders sparse orders without throwing ===\n");

// Extract showOrderDetails from each dashboard and run it against a DOM stub.
for (const page of ["page-dashboard.js", "page-market-dashboard.js"]) {
	const src = fs.readFileSync(path.join(JS_DIR, page), "utf8");
	const idx = src.indexOf("function showOrderDetails(order)");
	if (idx === -1) {
		fail(`${page}: showOrderDetails not found`);
		continue;
	}
	// Grab the function body up to the closing brace at the same indent level.
	const body = src.slice(idx);
	const endMarker = body.indexOf("\n\t\t\t}");
	const fnSrc = body.slice(0, endMarker === -1 ? 4000 : endMarker + 5);

	const elements = new Map();
	const stubEl = () => ({
		_text: "",
		_html: "",
		set textContent(v) {
			this._text = String(v);
		},
		get textContent() {
			return this._text;
		},
		set innerHTML(v) {
			this._html = String(v);
		},
		get innerHTML() {
			return this._html;
		},
		style: {},
		appendChild() {},
		onclick: null,
	});

	const sandbox = {
		document: {
			getElementById: (id) => {
				if (!elements.has(id)) elements.set(id, stubEl());
				return elements.get(id);
			},
			createElement: () => stubEl(),
		},
		showMessage: () => {},
		closeOrderDetails: () => {},
		openAssignDriverModal: () => {},
		isFinite,
		Number,
		Array,
		String,
		Date,
	};

	let fn;
	try {
		// eslint-disable-next-line no-new-func
		fn = new Function(
			...Object.keys(sandbox),
			`${fnSrc}; return showOrderDetails;`
		)(...Object.values(sandbox));
	} catch (e) {
		fail(`${page}: could not evaluate showOrderDetails (${e.message})`);
		continue;
	}

	const sparseOrders = {
		"missing customer (deleted user)": { _id: "1", orderNumber: "ORD-1", items: [] },
		"missing createdBy": { _id: "2", customer: { name: "A" }, items: [] },
		"missing status/payment": { _id: "3", customer: { name: "A" }, items: [] },
		"missing totals": { _id: "4", customer: { name: "A" }, items: [{ quantity: 2 }] },
		"items not an array": { _id: "5", customer: { name: "A" }, items: null },
		"item without product": {
			_id: "6",
			customer: { name: "A" },
			items: [{ quantity: 1, unitPrice: 5, totalPrice: 5 }],
		},
		"completely empty": {},
	};

	let pageOk = true;
	for (const [label, order] of Object.entries(sparseOrders)) {
		try {
			fn(order);
		} catch (e) {
			fail(`${page}: threw on ${label} -> ${e.message}`);
			pageOk = false;
		}
	}
	if (pageOk) pass(`${page}: renders all ${Object.keys(sparseOrders).length} sparse orders safely`);

	// Line total must not double-count quantity (totalPrice already includes it).
	fn({
		_id: "7",
		customer: { name: "A" },
		items: [{ quantity: 3, unitPrice: 10, totalPrice: 30 }],
		subtotal: 30,
		delivery: 0,
		total: 30,
	});
	const totalEl = elements.get("modal-total");
	totalEl && totalEl.textContent === "$30.00"
		? pass(`${page}: totals are not double-counted`)
		: fail(`${page}: modal-total = ${totalEl && totalEl.textContent} (expected $30.00)`);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
