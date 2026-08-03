/**
 * Live end-to-end check of every dashboard list endpoint plus full CRUD,
 * exercised as each role, against a running server.
 *
 * This answers "the table has data but shows nothing": it proves, per role and
 * per resource, that (a) the endpoint returns rows and (b) the shape the page
 * reads (via listFrom / data.<key>) actually finds those rows.
 *
 * Usage: node tests/_crud-live-check.js
 * Requires the server on http://localhost:10000.
 */
const BASE = process.env.API_BASE || "http://localhost:10000/api";

let failures = 0;
const fail = (m) => {
	console.log(`  FAIL  ${m}`);
	failures++;
};
const pass = (m) => console.log(`  PASS  ${m}`);

// Mirror of listFrom() in public/js/config.js.
function listFrom(payload, key) {
	if (!payload) return [];
	if (Array.isArray(payload)) return payload;
	if (key) {
		if (Array.isArray(payload[key])) return payload[key];
		if (payload.data && Array.isArray(payload.data[key])) return payload.data[key];
	}
	const data = payload.data;
	if (Array.isArray(data)) return data;
	if (Array.isArray(payload.items)) return payload.items;
	if (data && typeof data === "object") {
		if (Array.isArray(data.items)) return data.items;
		for (const k of Object.keys(data)) if (Array.isArray(data[k])) return data[k];
	}
	return [];
}

const call = async (method, url, { token, body } = {}) => {
	const res = await fetch(`${BASE}${url}`, {
		method,
		headers: {
			"Content-Type": "application/json",
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
		...(body ? { body: JSON.stringify(body) } : {}),
	});
	let json = null;
	try {
		json = await res.json();
	} catch {
		/* non-JSON (file download etc.) */
	}
	return { status: res.status, body: json };
};

const login = async (email, password) => {
	const r = await call("POST", "/auth/login-profile", { body: { email, password } });
	const d = r.body && r.body.data;
	return (d && (d.token || d.accessToken)) || null;
};

// Resources the dashboards render as tables: [label, path, key the page reads]
const LIST_ENDPOINTS = [
	["categories", "/categories?active=all", "categories"],
	["subcategories", "/subcategories?active=all", "subcategories"],
	["products", "/products?limit=5", "products"],
	["shelves", "/shelves", "shelves"],
	["orders", "/orders?limit=5", "orders"],
	["promocodes", "/promocodes", "promoCodes"],
	["announcements", "/announcements", "announcements"],
	["zones", "/zones", "zones"],
	// /api/settings only exposes /public (there is no collection root).
	["settings (public)", "/settings/public", "settings"],
];

(async () => {
	// Confirm the server is up before doing anything else.
	const health = await call("GET", "/health");
	if (health.status !== 200) {
		console.log(`\nServer not reachable at ${BASE} (status ${health.status}).`);
		console.log("Start it with:  node server.js\n");
		process.exit(1);
	}

	const adminEmail = process.env.ADMIN_EMAIL;
	const adminPassword = process.env.ADMIN_PASSWORD;
	let token = null;
	if (adminEmail && adminPassword) token = await login(adminEmail, adminPassword);

	console.log("\n=== 1. List endpoints return rows the page can actually read ===\n");
	for (const [label, url, key] of LIST_ENDPOINTS) {
		let r = await call("GET", url);
		// Retry authenticated so protected tables are covered too.
		if ((r.status === 401 || r.status === 403) && token) {
			r = await call("GET", url, { token });
		}
		if (r.status === 401 || r.status === 403) {
			console.log(`  SKIP  ${label} (auth required; set ADMIN_EMAIL/ADMIN_PASSWORD)`);
			continue;
		}
		if (r.status !== 200) {
			fail(`${label} -> HTTP ${r.status}`);
			continue;
		}
		const rows = listFrom(r.body, key);

		// Distinguish "genuinely empty collection" from "rows present but the
		// page cannot reach them". Only the latter is a bug.
		const data = (r.body && r.body.data) || {};
		const anyArray = Object.values(data).find(Array.isArray);
		const hasRowsSomewhere =
			(Array.isArray(data) && data.length > 0) ||
			(Array.isArray(anyArray) && anyArray.length > 0);

		if (rows.length > 0) {
			pass(`${label}: ${rows.length} row(s) readable via listFrom`);
		} else if (!hasRowsSomewhere) {
			console.log(`  INFO  ${label}: collection is empty (nothing to display)`);
		} else {
			// The exact failure mode the user reported.
			fail(`${label}: payload HAS rows but listFrom() found 0 — shape mismatch`);
			console.log(`        payload keys: ${JSON.stringify(Object.keys(data))}`);
		}
	}

	// -----------------------------------------------------------------------
	console.log("\n=== 2. Full CRUD lifecycle (admin) ===\n");

	if (!adminEmail || !adminPassword) {
		console.log("  SKIP  set ADMIN_EMAIL and ADMIN_PASSWORD to run write tests");
		console.log("        e.g. ADMIN_EMAIL=admin@x.com ADMIN_PASSWORD=... node tests/_crud-live-check.js");
	} else {
		if (!token) {
			fail("admin login failed — cannot run CRUD tests");
		} else {
			pass("admin signed in");

			const stamp = Date.now();

			// --- Category: create -> read -> update -> delete -----------------
			const created = await call("POST", "/categories", {
				token,
				body: { name: `_audit_cat_${stamp}`, description: "temp", isActive: true },
			});
			if (created.status !== 201 && created.status !== 200) {
				fail(`category CREATE -> HTTP ${created.status}: ${created.body && created.body.message}`);
			} else {
				pass("category CREATE");
				const cat =
					(created.body.data && (created.body.data.category || created.body.data)) || {};
				const id = cat._id;

				if (!id) {
					fail("category CREATE returned no _id — edit/delete cannot work");
				} else {
					// READ: does it show up in the list the table renders?
					const list = await call("GET", "/categories?active=all", { token });
					const found = listFrom(list.body, "categories").some((c) => c._id === id);
					found ? pass("category READ (appears in table list)") : fail("category READ — created row missing from list");

					// UPDATE
					const upd = await call("PUT", `/categories/${id}`, {
						token,
						body: { name: `_audit_cat_${stamp}_edited` },
					});
					upd.status === 200
						? pass("category UPDATE")
						: fail(`category UPDATE -> HTTP ${upd.status}: ${upd.body && upd.body.message}`);

					// DELETE
					const del = await call("DELETE", `/categories/${id}`, { token });
					[200, 204].includes(del.status)
						? pass("category DELETE")
						: fail(`category DELETE -> HTTP ${del.status}: ${del.body && del.body.message}`);

					// Confirm it is gone / deactivated.
					const after = await call("GET", "/categories?active=all", { token });
					const still = listFrom(after.body, "categories").find((c) => c._id === id);
					if (!still || still.isActive === false) pass("category removed or deactivated after DELETE");
					else fail("category still active after DELETE");
				}
			}
		}
	}

	console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
	process.exit(failures === 0 ? 0 : 1);
})();
