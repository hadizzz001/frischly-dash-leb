/*
 * Tests the /api/translate proxy WITHOUT booting the full server (no DB/Firebase).
 * It mounts only the translate route on a throwaway Express app.
 *
 *   node tests/_translate-proxy-check.js
 */
const express = require("express");
const http = require("http");

const translateRoutes = require("../src/routes/translate");

function post(port, path, body) {
	return new Promise((resolve, reject) => {
		const data = JSON.stringify(body);
		const req = http.request(
			{
				port,
				path,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Content-Length": Buffer.byteLength(data),
				},
			},
			(res) => {
				let buf = "";
				res.on("data", (c) => (buf += c));
				res.on("end", () =>
					resolve({ status: res.statusCode, body: JSON.parse(buf || "{}") })
				);
			}
		);
		req.on("error", reject);
		req.write(data);
		req.end();
	});
}

(async () => {
	const app = express();
	app.use(express.json());
	app.use("/api/translate", translateRoutes);
	const server = app.listen(0);
	await new Promise((r) => server.once("listening", r));
	const port = server.address().port;
	console.log("Test server on port", port, "\n");

	let pass = 0;
	let fail = 0;
	const ok = (cond, msg) => {
		console.log((cond ? "  ✓ " : "  ✗ ") + msg);
		cond ? pass++ : fail++;
	};

	// 1) Basic batch translation -> Arabic
	const phrases = [
		"Dashboard Overview",
		"Settings",
		"Products",
		"Total Customers",
		"Sign Out",
		"Save Changes",
		"Cancel",
	];
	const t0 = Date.now();
	const r1 = await post(port, "/api/translate", { q: phrases, target: "ar" });
	const dt1 = Date.now() - t0;
	ok(r1.status === 200, "HTTP 200 on batch request");
	ok(r1.body.success === true, "success: true");
	ok(
		Array.isArray(r1.body.translations) &&
			r1.body.translations.length === phrases.length,
		`returns ${phrases.length} translations`
	);
	const arabicCount = (r1.body.translations || []).filter((s) =>
		/[\u0600-\u06FF]/.test(s)
	).length;
	ok(arabicCount === phrases.length, `all ${phrases.length} are Arabic script`);
	console.log("    first call took", dt1 + "ms");
	phrases.forEach((p, i) =>
		console.log(`      ${p}  ->  ${r1.body.translations[i]}`)
	);

	// 2) Cache makes the second identical call fast and identical
	const t1 = Date.now();
	const r2 = await post(port, "/api/translate", { q: phrases, target: "ar" });
	const dt2 = Date.now() - t1;
	ok(
		JSON.stringify(r2.body.translations) ===
			JSON.stringify(r1.body.translations),
		"cached call returns identical output"
	);
	ok(dt2 < 50, `cached call is fast (${dt2}ms < 50ms)`);

	// 3) Same source/target is a no-op passthrough
	const r3 = await post(port, "/api/translate", {
		q: ["Hello"],
		target: "en",
		source: "en",
	});
	ok(r3.body.translations[0] === "Hello", "en->en passthrough");

	// 4) Validation: unsupported language -> 400
	const r4 = await post(port, "/api/translate", { q: ["Hi"], target: "zz" });
	ok(r4.status === 400, "unsupported target -> HTTP 400");

	// 5) Validation: q not an array -> 400
	const r5 = await post(port, "/api/translate", { q: "nope", target: "ar" });
	ok(r5.status === 400, "non-array q -> HTTP 400");

	// 6) Placeholder strings are still returned (server doesn't drop them)
	const r6 = await post(port, "/api/translate", {
		q: ["Successfully {action}d {count} products!"],
		target: "ar",
	});
	ok(
		typeof r6.body.translations[0] === "string" &&
			r6.body.translations[0].length > 0,
		"placeholder string returns a value"
	);

	server.close();
	console.log(`\n=== ${pass} passed, ${fail} failed ===`);
	process.exit(fail ? 1 : 0);
})().catch((e) => {
	console.error("FATAL", e);
	process.exit(1);
});
