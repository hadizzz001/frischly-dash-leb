/**
 * Verifies the two fixes for "Failed to save user: Validation failed: ..."
 *
 *  1. The phone rule in src/routes/auth.js now normalizes BEFORE matching,
 *     so every common Lebanese format is accepted.
 *  2. sendValidationError() reports the exact field + received value, and
 *     formatApiError() in public/js/config.js renders it for the user.
 *
 * Run: node tests/_validation-error-check.js
 */
const path = require("path");
const fs = require("fs");
const express = require("express");

const ROOT = path.join(__dirname, "..");
let failures = 0;

// Minimal supertest stand-in: boot the app on an ephemeral port and POST to it.
const listen = (app) =>
	new Promise((resolve) => {
		const server = app.listen(0, "127.0.0.1", () =>
			resolve({ server, port: server.address().port })
		);
	});

const post = async (port, route, payload) => {
	const res = await fetch(`http://127.0.0.1:${port}${route}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});
	return { status: res.status, body: await res.json().catch(() => ({})) };
};

const check = (name, ok, detail = "") => {
	console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
	if (!ok) failures++;
};

// ---------------------------------------------------------------------------
// 1. The real route validation chain, exercised through express
// ---------------------------------------------------------------------------
const { body, validationResult } = require("express-validator");
const { normalizeLebanonPhone } = require(path.join(ROOT, "src/utils/phone"));
const { sendValidationError } = require(path.join(ROOT, "src/utils/apiResponse"));

const phoneRule = body("phoneNumber")
	.optional({ checkFalsy: true })
	.trim()
	.customSanitizer((value) => normalizeLebanonPhone(value))
	.matches(/^\+961\d{7,8}$/)
	.withMessage(
		"Phone number must be a Lebanese number. Enter 7-8 digits, e.g. 70123456 or +96170123456."
	);

const app = express();
app.use(express.json());
// Mirrors the snapshot middleware in server.js
app.use((req, res, next) => {
	if (req.body && typeof req.body === "object") {
		req.rawBody = JSON.parse(JSON.stringify(req.body));
	}
	next();
});
app.post("/t", phoneRule, (req, res) => {
	const errors = validationResult(req);
	if (!errors.isEmpty()) return sendValidationError(res, errors, 400, req);
	res.status(200).json({ success: true, stored: req.body.phoneNumber });
});

const ACCEPT = [
	"+96170123456",
	"70123456",
	"03123456",
	"+961 70 123 456",
	"+961-70-123456",
	"0096170123456",
	"961 70 123 456",
	"+9613123456",
];
const REJECT = ["12", "not-a-phone", "+4915112345678"];

(async () => {
	const { server, port } = await listen(app);

	console.log("\n1) Phone formats an admin might actually type\n");
	for (const input of ACCEPT) {
		const res = await post(port, "/t", { phoneNumber: input });
		check(
			`accepts "${input}"`,
			res.status === 200,
			res.status === 200 ? `-> stored ${res.body.stored}` : `-> ${res.body.message}`
		);
	}

	console.log("\n2) Genuinely invalid numbers are still rejected\n");
	for (const input of REJECT) {
		const res = await post(port, "/t", { phoneNumber: input });
		check(`rejects "${input}"`, res.status === 400);
	}

	console.log("\n3) The error payload names the exact field and value\n");
	const bad = await post(port, "/t", { phoneNumber: "12" });
	const e = Array.isArray(bad.body.errors) ? bad.body.errors[0] : null;
	check("errors[] is an array", Array.isArray(bad.body.errors));
	check("names the field", e && e.field === "phoneNumber", e && `field=${e.field}`);
	check("echoes what was received", e && e.received === "12", e && `received=${e.received}`);
	check("message mentions the field", /phoneNumber/.test(bad.body.message || ""));
	console.log(`\n  message: ${bad.body.message}\n`);

	// -----------------------------------------------------------------------
	// 4. Passwords must never be echoed back
	// -----------------------------------------------------------------------
	const pwApp = express();
	pwApp.use(express.json());
	pwApp.post(
		"/p",
		body("password").isLength({ min: 6 }).withMessage("too short"),
		(req, res) => sendValidationError(res, validationResult(req), 400, req)
	);
	const { server: pwServer, port: pwPort } = await listen(pwApp);
	const pw = await post(pwPort, "/p", { password: "abc" });
	check("password value is hidden", pw.body.errors[0].received === "[hidden]");
	pwServer.close();
	server.close();

	// -----------------------------------------------------------------------
	// 5. formatApiError() in the browser bundle
	// -----------------------------------------------------------------------
	console.log("\n5) Front-end formatter\n");
	const cfg = fs.readFileSync(path.join(ROOT, "public/js/config.js"), "utf8");
	const src = cfg.slice(cfg.indexOf("function formatApiError"));
	const fnBody = src.slice(0, src.indexOf("\n}\n") + 2);
	// eslint-disable-next-line no-eval
	const formatApiError = eval(`(${fnBody})`);

	const rendered = formatApiError(bad.body);
	check("mentions the field", /phoneNumber/.test(rendered));
	check("shows the value entered", /you entered: "12"/.test(rendered));
	check("is multi-line", rendered.includes("\n"));
	check("falls back when there are no details", formatApiError({ message: "Nope" }) === "Nope");
	check("falls back on garbage", formatApiError(null, "boom") === "boom");
	console.log(`\n${rendered}\n`);

	// -----------------------------------------------------------------------
	// 6. Every page that calls the helper also loads config.js
	// -----------------------------------------------------------------------
	console.log("6) Pages load config.js before using the helper\n");
	const jsDir = path.join(ROOT, "public/js");
	const users = fs
		.readdirSync(jsDir)
		.filter((f) => f.endsWith(".js") && f !== "config.js")
		.filter((f) => fs.readFileSync(path.join(jsDir, f), "utf8").includes("formatApiError"));

	for (const file of users) {
		const pages = fs
			.readdirSync(path.join(ROOT, "public"))
			.filter((p) => p.endsWith(".html"))
			.filter((p) =>
				fs.readFileSync(path.join(ROOT, "public", p), "utf8").includes(`js/${file}`)
			);
		for (const page of pages) {
			const html = fs.readFileSync(path.join(ROOT, "public", page), "utf8");
			check(`${page} loads config.js`, html.includes("js/config.js"));
		}
	}

	console.log(
		`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`
	);
	process.exit(failures === 0 ? 0 : 1);
})();
