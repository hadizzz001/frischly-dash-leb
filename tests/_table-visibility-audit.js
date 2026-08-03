/* Audits every table-rendering site for the "invisible cell" failure mode:
   - JS that computes a colour variable but never uses it (extraction dropped it)
   - generated classes whose CSS body is empty / comment-only
   - rules that set a white foreground with no background
*/
const fs = require("fs");
const path = require("path");

const jsDir = path.join(__dirname, "..", "public", "js");
const cssDir = path.join(__dirname, "..", "public", "css");

const read = (d, f) => fs.readFileSync(path.join(d, f), "utf8");
const jsFiles = fs.readdirSync(jsDir).filter((f) => f.endsWith(".js"));
const cssFiles = fs.readdirSync(cssDir).filter((f) => f.endsWith(".css"));

// Concatenate all CSS so we can look up any class from any page.
const allCss = cssFiles.map((f) => read(cssDir, f)).join("\n");

let issues = 0;

// ---- 1. Colour variables computed but never applied -----------------------
console.log("=== 1. Colour variables computed but never used in markup ===");
for (const f of jsFiles) {
	const src = read(jsDir, f);
	const declared = [...src.matchAll(/const\s+(\w*[Cc]olor)\s*=\s*get\w+\(/g)].map((m) => m[1]);
	for (const v of new Set(declared)) {
		// Used inside a template literal (i.e. actually rendered)?
		const usedInMarkup = new RegExp("\\$\\{" + v + "\\b").test(src);
		if (!usedInMarkup) {
			console.log(`  DEAD  ${f}: '${v}' is computed but never rendered`);
			issues++;
		}
	}
}
if (issues === 0) console.log("  (none)");

// ---- 2. Generated classes with empty/comment-only bodies ------------------
console.log("\n=== 2. Generated classes used in JS but styled with an empty rule ===");
let empties = 0;
for (const f of jsFiles) {
	const src = read(jsDir, f);
	const used = new Set([...src.matchAll(/\b((?:dsx|mdx)-\d+)\b/g)].map((m) => m[1]));
	for (const cls of used) {
		// Check EVERY rule for this class across all stylesheets — a rule left
		// empty in the extracted file may be covered by another sheet
		// (e.g. global.css), which is a valid fix.
		const rules = [...allCss.matchAll(new RegExp("\\." + cls + "\\b[^{}]*\\{([\\s\\S]*?)\\}", "g"))];
		if (!rules.length) continue;
		const anyStyled = rules.some(
			(r) => r[1].replace(/\/\*[\s\S]*?\*\//g, "").trim().length > 0
		);
		if (!anyStyled) {
			console.log(`  EMPTY ${f}: .${cls} has no declarations in ANY stylesheet`);
			empties++;
		}
	}
}
if (empties === 0) console.log("  (none)");
issues += empties;

// ---- 3. White text with no background ------------------------------------
console.log("\n=== 3. CSS rules setting white text without a background ===");
let whites = 0;

// A class is safe if ANY stylesheet gives it (or a modifier of it) a
// background. Checking one file at a time produced false positives: the
// extracted sheets set `color: white` while global.css supplies the
// background, which is perfectly visible in the browser. `allCss` (declared
// above) is the concatenation of every stylesheet.
const hasBackgroundSomewhere = (sel) => {
	// Strip pseudo/state suffixes so ".x.low" counts as a background for ".x".
	const base = sel.split(",")[0].trim().split(/[\s>+~]/).pop().replace(/[:.].*$/, (m) =>
		m.startsWith(":") ? "" : m
	);
	const cls = (base.match(/\.[\w-]+/) || [base])[0];
	if (!cls || !cls.startsWith(".")) return false;
	const escaped = cls.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const re = new RegExp(`${escaped}[^{}]*\\{[^{}]*background`, "i");
	return re.test(allCss);
};

for (const f of cssFiles) {
	const src = read(cssDir, f);
	const rules = [...src.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
	for (const [, selector, body] of rules) {
		const hasWhiteText = /color\s*:\s*(white|#fff(?:fff)?)\b/i.test(body);
		const hasBg = /background(-color)?\s*:/i.test(body);
		if (hasWhiteText && !hasBg) {
			const sel = selector.trim().replace(/\s+/g, " ");
			// Ignore selectors that are clearly on a coloured parent (buttons, headers).
			if (/badge|cell|td|table/i.test(sel) && !hasBackgroundSomewhere(sel)) {
				console.log(`  RISK  ${f}: "${sel}" sets white text with no background`);
				whites++;
			}
		}
	}
}
if (whites === 0) console.log("  (none)");
issues += whites;

console.log(
	issues === 0
		? "\nPASS: no invisible-cell risks found."
		: `\n${issues} issue(s) found.`
);
