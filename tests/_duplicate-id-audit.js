/**
 * Duplicate-id audit for the dashboard pages.
 *
 * document.getElementById() returns only the FIRST match. When an id is used
 * twice, every read/write silently targets the wrong element — a section can
 * look "dead" even though its markup and handlers are perfectly fine.
 *
 *   node tests/_duplicate-id-audit.js
 */
const fs = require("fs");
const path = require("path");

const failures = [];
const pass = (m) => console.log(`  PASS  ${m}`);
const fail = (m) => {
	console.log(`  FAIL  ${m}`);
	failures.push(m);
};

const PAGES = ["dashboard.html", "market-dashboard.html", "ordermanagement.html"];

for (const page of PAGES) {
	const file = path.join(__dirname, "..", "public", page);
	if (!fs.existsSync(file)) continue;
	const html = fs.readFileSync(file, "utf8");

	console.log(`\n########## ${page} ##########`);

	const seen = new Map();
	const re = /\sid\s*=\s*"([^"]+)"/g;
	let m;
	while ((m = re.exec(html)) !== null) {
		const id = m[1];
		const line = html.slice(0, m.index).split("\n").length;
		if (!seen.has(id)) seen.set(id, []);
		seen.get(id).push(line);
	}

	const dupes = [...seen.entries()].filter(([, lines]) => lines.length > 1);
	if (dupes.length === 0) {
		pass(`${seen.size} unique id(s), no duplicates`);
	} else {
		for (const [id, lines] of dupes) {
			fail(`#${id} appears ${lines.length}x (lines ${lines.join(", ")})`);
		}
	}
}

console.log(
	failures.length === 0
		? "\nALL CHECKS PASSED\n"
		: `\n${failures.length} CHECK(S) FAILED\n`
);
process.exit(failures.length === 0 ? 0 : 1);
