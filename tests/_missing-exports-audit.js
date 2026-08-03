/*
 * Freshly.lb — audit: helpers that are imported but never exported.
 *
 * `const { sendServerError } = require("../utils/apiResponse")` succeeds even
 * when the module does NOT export that name — the binding is simply undefined.
 * The failure only surfaces when the line runs. Because these helpers live in
 * catch blocks, the result is brutal: an error occurs, the catch runs, calling
 * undefined throws a SECOND error, no response is ever sent, and the request
 * hangs until the client times out. The user sees an endless spinner.
 *
 * This audit resolves every destructured require against the target module's
 * real exports.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "src");

let failures = 0;
const fail = (m) => {
	failures++;
	console.log("  FAIL  " + m);
};
const pass = (m) => console.log("  PASS  " + m);

const walk = (dir) => {
	const out = [];
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) out.push(...walk(p));
		else if (e.name.endsWith(".js")) out.push(p);
	}
	return out;
};

const files = walk(ROOT);

console.log("\n=== 1. Destructured requires resolve to real exports ===\n");

let checked = 0;
for (const file of files) {
	const src = fs.readFileSync(file, "utf8");

	// const { a, b } = require("../utils/x");
	const re = /const\s*\{([^}]+)\}\s*=\s*require\(\s*"(\.[^"]+)"\s*\)/g;
	for (const m of src.matchAll(re)) {
		const names = m[1]
			.split("\n")
			// Drop commented-out entries — `//getCategoryStats,` is not an import.
			.map((l) => l.replace(/\/\/.*$/, ""))
			.join("\n")
			.split(",")
			.map((s) => s.trim().split(":")[0].trim())
			.filter(Boolean);
		const target = path.resolve(path.dirname(file), m[2]);
		const targetFile = fs.existsSync(target + ".js")
			? target + ".js"
			: fs.existsSync(path.join(target, "index.js"))
				? path.join(target, "index.js")
				: null;
		if (!targetFile) continue; // node_modules or a directory module

		let mod;
		try {
			mod = require(targetFile);
		} catch {
			continue; // module has side effects we should not trigger
		}
		if (!mod || typeof mod !== "object") continue;

		for (const name of names) {
			checked++;
			if (!(name in mod)) {
				fail(
					`${path.relative(ROOT, file)} imports "${name}" from ` +
						`${path.relative(ROOT, targetFile)} — NOT exported (undefined at runtime)`
				);
			}
		}
	}
}
if (failures === 0) pass(`all ${checked} destructured imports resolve`);

// ── 2. sendServerError is called with the documented argument order ─────────
console.log("\n=== 2. sendServerError(res, error, message) call shape ===\n");

const apiResponse = require(path.join(ROOT, "utils", "apiResponse.js"));
if (typeof apiResponse.sendServerError !== "function") {
	fail("apiResponse does not export sendServerError");
} else {
	pass("apiResponse exports sendServerError");

	let sites = 0;
	let bad = 0;
	for (const file of files) {
		const src = fs.readFileSync(file, "utf8");
		for (const m of src.matchAll(/sendServerError\(([^;]*?)\)\s*;/g)) {
			sites++;
			const args = m[1].split(",").map((s) => s.trim());
			if (args[0] !== "res") {
				bad++;
				fail(
					`${path.relative(ROOT, file)}: sendServerError first arg is ` +
						`"${args[0]}" — expected res`
				);
			}
		}
	}
	if (bad === 0) pass(`all ${sites} call sites pass res first`);
}

// ── 3. It must always produce a response, never throw ──────────────────────
console.log("\n=== 3. sendServerError always responds ===\n");

const makeRes = () => {
	const r = {
		headersSent: false,
		statusCode: null,
		body: null,
		status(c) {
			this.statusCode = c;
			return this;
		},
		json(b) {
			this.body = b;
			this.headersSent = true;
			return this;
		},
	};
	return r;
};

const cases = [
	["with an Error", new Error("boom")],
	["with null", null],
	["with a string", "something failed"],
	["with undefined", undefined],
];
for (const [label, err] of cases) {
	const res = makeRes();
	try {
		apiResponse.sendServerError(res, err, "Test message");
		if (res.statusCode !== 500) fail(`${label}: status was ${res.statusCode}, expected 500`);
		else if (!res.body || res.body.success !== false)
			fail(`${label}: body is not a failure envelope`);
		else pass(`${label} -> 500 with a proper envelope`);
	} catch (e) {
		fail(`${label}: threw ${e.message}`);
	}
}

// Must not write twice if a response already went out.
const sent = makeRes();
sent.headersSent = true;
try {
	apiResponse.sendServerError(sent, new Error("late"), "Too late");
	if (sent.body !== null) fail("wrote a second response after headersSent");
	else pass("no double-write when headers were already sent");
} catch (e) {
	fail("threw on headersSent: " + e.message);
}

// The client must never receive the raw error text.
const leak = makeRes();
apiResponse.sendServerError(leak, new Error("MongoServerError: secret cluster host"), "Error fetching data");
if (JSON.stringify(leak.body).includes("secret cluster host"))
	fail("raw error text leaked to the client");
else pass("raw error text is not leaked to the client");

// ── 4. Errors caused by the user are not reported as server faults ─────────
console.log("\n=== 4. sendServerError classifies user errors correctly ===\n");

// Mongoose ValidationError -> 400 naming the field.
const vErr = new Error("Validation failed");
vErr.name = "ValidationError";
vErr.errors = {
	companyName: { message: "Please provide a company name", value: undefined },
};
const vRes = makeRes();
apiResponse.sendServerError(vRes, vErr, "Server Error");
if (vRes.statusCode !== 400) fail(`ValidationError -> ${vRes.statusCode}, expected 400`);
else if (!/companyName/.test(JSON.stringify(vRes.body)))
	fail("ValidationError response does not name the field");
else pass("ValidationError -> 400 naming the field");

// CastError on an ObjectId -> 404, not a crash.
const cErr = new Error("Cast to ObjectId failed");
cErr.name = "CastError";
cErr.kind = "ObjectId";
const cRes = makeRes();
apiResponse.sendServerError(cRes, cErr, "Server Error");
if (cRes.statusCode !== 404) fail(`CastError -> ${cRes.statusCode}, expected 404`);
else pass("CastError(ObjectId) -> 404");

// Duplicate key -> 409 naming the conflicting field.
const dErr = new Error("E11000 duplicate key");
dErr.code = 11000;
dErr.keyPattern = { code: 1 };
dErr.keyValue = { code: "SAVE10" };
const dRes = makeRes();
apiResponse.sendServerError(dRes, dErr, "Server Error");
if (dRes.statusCode !== 409) fail(`duplicate key -> ${dRes.statusCode}, expected 409`);
else if (!/SAVE10/.test(JSON.stringify(dRes.body)))
	fail("duplicate key response does not name the conflicting value");
else pass("duplicate key -> 409 naming the field and value");

// A genuine server fault is still a 500.
const sRes = makeRes();
apiResponse.sendServerError(sRes, new TypeError("x is not a function"), "Server Error");
if (sRes.statusCode !== 500) fail(`TypeError -> ${sRes.statusCode}, expected 500`);
else pass("genuine faults are still 500");

// Passwords must not be echoed back even in validation detail.
const pErr = new Error("Validation failed");
pErr.name = "ValidationError";
pErr.errors = { password: { message: "Too short", value: "hunter2" } };
const pRes = makeRes();
apiResponse.sendServerError(pRes, pErr, "Server Error");
if (JSON.stringify(pRes.body).includes("hunter2"))
	fail("password value echoed back to the client");
else pass("password values are not echoed back");

console.log(
	failures === 0 ? "\nALL CHECKS PASSED\n" : `\n${failures} CHECK(S) FAILED\n`
);
process.exit(failures === 0 ? 0 : 1);
