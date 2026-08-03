/* Renders the order-row markup the dashboards produce and checks the badges
   carry a real colour class, then verifies those classes exist in CSS with
   both a background and a foreground (i.e. cannot be white-on-white). */
const fs = require("fs");
const path = require("path");

const cssDir = path.join(__dirname, "..", "public", "css");
const allCss = fs
	.readdirSync(cssDir)
	.filter((f) => f.endsWith(".css"))
	.map((f) => fs.readFileSync(path.join(cssDir, f), "utf8"))
	.join("\n");

const slug = (v) => String(v || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-");

const STATUSES = ["pending", "confirmed", "processing", "OnTheWay", "delivered", "cancelled"];
const PAYMENTS = ["pending", "paid", "failed", "refunded", "ondelivery", "paidondelivery", "cancelled"];

// Resolve the effective background/colour for a class across all stylesheets.
function resolve(cls) {
	const rules = [...allCss.matchAll(new RegExp("\\." + cls + "\\b[^{}]*\\{([\\s\\S]*?)\\}", "g"))];
	let bg = null;
	let fg = null;
	for (const r of rules) {
		const body = r[1];
		const bgM = body.match(/background(?:-color)?\s*:\s*([^;!]+)/i);
		const fgM = body.match(/(?<!-)color\s*:\s*([^;!]+)/i);
		if (bgM) bg = bgM[1].trim();
		if (fgM) fg = fgM[1].trim();
	}
	return { bg, fg, found: rules.length > 0 };
}

let bad = 0;

console.log("=== Order STATUS badges ===");
for (const s of STATUSES) {
	const cls = "status-" + slug(s);
	const { bg, fg, found } = resolve(cls);
	const invisible = !found || !bg || !fg || (/#fff|white/i.test(fg) && /#fff|white/i.test(bg));
	if (invisible) bad++;
	console.log(
		`  ${invisible ? "FAIL" : "OK  "} .${cls.padEnd(22)} bg=${String(bg).padEnd(10)} text=${fg}`
	);
}

console.log("\n=== PAYMENT badges ===");
for (const p of PAYMENTS) {
	const cls = "pay-" + slug(p);
	const { bg, fg, found } = resolve(cls);
	const invisible = !found || !bg || !fg || (/#fff|white/i.test(fg) && /#fff|white/i.test(bg));
	if (invisible) bad++;
	console.log(
		`  ${invisible ? "FAIL" : "OK  "} .${cls.padEnd(22)} bg=${String(bg).padEnd(10)} text=${fg}`
	);
}

// The bare .status-badge must also be visible on its own.
console.log("\n=== Base .status-badge (fallback) ===");
const base = resolve("status-badge");
const baseBad = !base.bg || !base.fg;
if (baseBad) bad++;
console.log(`  ${baseBad ? "FAIL" : "OK  "} bg=${base.bg} text=${base.fg}`);

console.log(
	bad === 0
		? "\nPASS: every status/payment badge has a visible background AND text colour."
		: `\nFAIL: ${bad} badge(s) could render invisible.`
);
