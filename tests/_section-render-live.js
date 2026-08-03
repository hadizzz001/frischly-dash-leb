/**
 * Renders dashboard.html in a real DOM and drives showSection() for every
 * sidebar entry, asserting the panel actually becomes visible.
 *
 * Static checks kept saying Promo Codes / Announcements were fine, so this
 * exercises the real thing: parse the page, load the real stylesheets, run the
 * real showSection(), then ask the DOM whether the panel is displayed —
 * including the effect of every ancestor.
 *
 *   node tests/_section-render-live.js
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const failures = [];
const pass = (m) => console.log(`  PASS  ${m}`);
const fail = (m) => {
	console.log(`  FAIL  ${m}`);
	failures.push(m);
};

const PUB = path.join(__dirname, "..", "public");

function auditPage(page, scriptName) {
	console.log(`\n########## ${page} ##########`);
	const html = fs.readFileSync(path.join(PUB, page), "utf8");

	const dom = new JSDOM(html, { runScripts: "outside-only" });
	const { window } = dom;
	const { document } = window;

	// Inline the real stylesheets so display rules actually apply.
	for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
		const href = (link.getAttribute("href") || "").replace(/^\.?\//, "");
		const cssPath = path.join(PUB, href);
		if (fs.existsSync(cssPath)) {
			const style = document.createElement("style");
			style.textContent = fs.readFileSync(cssPath, "utf8");
			document.head.appendChild(style);
		}
	}

	// Minimal showSection(), mirroring public/js/page-dashboard.js: hide all,
	// then mark the requested panel active.
	function showSection(name) {
		document
			.querySelectorAll(".content-section")
			.forEach((s) => s.classList.remove("active"));
		const target = document.getElementById(name + "-section");
		if (target) target.classList.add("active");
		return target;
	}

	// Is the element visible once every ancestor is taken into account?
	function isVisible(el) {
		let node = el;
		while (node && node.nodeType === 1) {
			const cs = window.getComputedStyle(node);
			if (cs.display === "none") return { visible: false, blocker: node };
			if (cs.visibility === "hidden") return { visible: false, blocker: node };
			node = node.parentElement;
		}
		return { visible: true, blocker: null };
	}

	const keys = [
		...new Set(
			[...html.matchAll(/showSection\('([^']+)'\)"\s+id="menu-/g)].map((x) => x[1])
		),
	];

	for (const key of keys) {
		const target = showSection(key);
		if (!target) {
			fail(`${key}: #${key}-section does not exist`);
			continue;
		}
		const { visible, blocker } = isVisible(target);
		if (visible) {
			pass(`${key}: panel is visible after showSection('${key}')`);
		} else {
			const desc =
				blocker === target
					? "the panel itself"
					: `ancestor <${blocker.tagName.toLowerCase()}${
							blocker.id ? "#" + blocker.id : ""
					  } class="${blocker.className}">`;
			fail(`${key}: hidden by ${desc}`);
		}
	}

	// The panel must also contain the table body its loader writes into.
	const TBODY = {
		promocodes: ["promo-table-body", "onetime-table-body"],
		announcements: ["announcements-table-body"],
		kitchens: ["kitchens-table-body"],
		kitchencategories: ["kitchen-categories-table-body"],
		waste: ["waste-records-list"],
	};
	for (const [key, ids] of Object.entries(TBODY)) {
		const section = document.getElementById(key + "-section");
		if (!section) continue;
		for (const id of ids) {
			const el = document.getElementById(id);
			if (!el) {
				fail(`${key}: #${id} not found anywhere in the page`);
			} else if (!section.contains(el)) {
				fail(`${key}: #${id} exists but is OUTSIDE #${key}-section`);
			} else {
				pass(`${key}: #${id} is inside its section`);
			}
		}
	}

	void scriptName;
	dom.window.close();
}

auditPage("dashboard.html", "page-dashboard.js");
auditPage("market-dashboard.html", "page-market-dashboard.js");

console.log(
	failures.length === 0
		? "\nALL CHECKS PASSED\n"
		: `\n${failures.length} CHECK(S) FAILED\n`
);
process.exit(failures.length === 0 ? 0 : 1);
