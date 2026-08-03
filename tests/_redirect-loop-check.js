/* Redirect-graph loop detector.
   Models each page's role gate exactly as implemented in public/js, then
   walks the graph for every role to prove no role can enter a cycle. */

const MARKET_ROLES = ["market", "market_manager", "market_staff", "market_driver"];
const ADMIN_ROLES = ["manager", "rider", "staff"];

// Where an admin-only page sends a non-admin (shared helper used by
// market-products / market-manage / market-orders / markets).
const adminOnlyFallback = (role) => {
	if (MARKET_ROLES.includes(role)) return "/market-dashboard";
	if (ADMIN_ROLES.includes(role)) return "/dashboard";
	return "/profile";
};

// getProductPageForRole() from config.js
const productPageForRole = (role) => {
	if (MARKET_ROLES.includes(role)) return "/market-dashboard";
	if (["admin", ...ADMIN_ROLES].includes(role)) return "/dashboard";
	return "/profile";
};

// pageName -> (role) => nextPage | null (null = user stays, terminal)
const GRAPH = {
	"/": (role) => productPageForRole(role),
	"/signin": (role) => productPageForRole(role),
	"/signup": (role) => productPageForRole(role),

	"/dashboard": (role) => {
		const allowed = ["manager", "admin", "rider", "staff"];
		if (allowed.includes(role)) return null;
		return MARKET_ROLES.includes(role) ? "/market-dashboard" : "/profile";
	},

	"/market-dashboard": (role) => {
		const allowed = MARKET_ROLES;
		if (allowed.includes(role)) return null;
		return ["manager", "admin", "rider", "staff"].includes(role) ? "/dashboard" : "/profile";
	},

	"/market-products": (role) => (role === "admin" ? null : adminOnlyFallback(role)),
	"/market-manage": (role) => (role === "admin" ? null : adminOnlyFallback(role)),
	"/market-orders": (role) => (role === "admin" ? null : adminOnlyFallback(role)),
	"/markets": (role) => (role === "admin" ? null : adminOnlyFallback(role)),

	"/profile": () => null, // profile has no role gate
	"/market": () => "/signin", // retired login page -> 301 to the single sign-in
};

const ROLES = [
	"admin",
	"manager",
	"staff",
	"rider",
	"market",
	"market_manager",
	"market_staff",
	"market_driver",
	"customer",
	"unknown_future_role",
];

const ENTRY_POINTS = Object.keys(GRAPH);

let failures = 0;

for (const role of ROLES) {
	for (const entry of ENTRY_POINTS) {
		const seen = [];
		let page = entry;
		let steps = 0;

		while (page && steps < 25) {
			if (seen.includes(page)) {
				console.log(`LOOP  role=${role.padEnd(20)} ${seen.join(" -> ")} -> ${page}`);
				failures++;
				break;
			}
			seen.push(page);
			const next = GRAPH[page] ? GRAPH[page](role) : null;
			if (!next) break; // terminal - user rests here
			page = next;
			steps++;
		}

		if (steps >= 25) {
			console.log(`RUNAWAY role=${role} from ${entry}: ${seen.join(" -> ")}`);
			failures++;
		}
	}
}

// Report the final resting page per role from the landing page.
console.log("\nFinal destination starting from '/':");
for (const role of ROLES) {
	let page = "/";
	const seen = [];
	while (page && !seen.includes(page)) {
		seen.push(page);
		const next = GRAPH[page] ? GRAPH[page](role) : null;
		if (!next) break;
		page = next;
	}
	console.log("  " + role.padEnd(20) + " -> " + page);
}

console.log(
	failures === 0
		? "\nPASS: no redirect loops for any role from any entry point."
		: `\nFAIL: ${failures} loop(s) detected.`
);
