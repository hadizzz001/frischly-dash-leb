/*
 * Freshly.lb — LIVE CRUD check for the admin sections.
 *
 * Static analysis said these sections were fine, but the pages still misbehave,
 * so this exercises the real thing: for each section it performs
 * Create -> Read (list + by id) -> Update -> Delete against the running server
 * with a real admin token, and verifies the response at every step using the
 * SAME helpers the pages use (listFrom / objectFrom from public/js/config.js).
 *
 * Anything it creates is deleted again; nothing is left behind.
 *
 *     node tests/_crud-sections-live.js
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const BASE = process.env.API_BASE || "http://localhost:10000/api";

// Use the shipped helpers, not copies, so this tests what the pages run.
const configSrc = fs.readFileSync(
	path.join(__dirname, "..", "public", "js", "config.js"),
	"utf8"
);
const grab = (name) =>
	eval(
		`(${configSrc
			.slice(configSrc.indexOf("function " + name))
			.match(new RegExp("^function " + name + "[\\s\\S]*?\\n}"))[0]})`
	);
const listFrom = grab("listFrom");
const objectFrom = grab("objectFrom");

let failures = 0;
const fail = (m) => {
	failures++;
	console.log("  FAIL  " + m);
};
const pass = (m) => console.log("  PASS  " + m);

let TOKEN = null;
const api = async (method, url, body) => {
	const opts = {
		method,
		headers: { Authorization: `Bearer ${TOKEN}` },
	};
	if (body !== undefined) {
		opts.headers["Content-Type"] = "application/json";
		opts.body = JSON.stringify(body);
	}
	const res = await fetch(BASE + url, opts);
	let json = null;
	try {
		json = await res.json();
	} catch {
		/* non-JSON */
	}
	return { status: res.status, ok: res.ok, json };
};

const uniq = () => Math.random().toString(36).slice(2, 8).toUpperCase();

(async () => {
	const health = await fetch(`${BASE}/health`).catch(() => null);
	if (!health || health.status !== 200) {
		console.log(`\nServer not reachable at ${BASE}. Start it: node server.js\n`);
		process.exit(1);
	}

	await mongoose.connect(process.env.MONGODB_URI);
	const admin = await mongoose.connection.db
		.collection("users")
		.findOne({ role: "admin" }, { projection: { _id: 1, role: 1 } });
	if (!admin) {
		console.log("\nNo admin user found.\n");
		await mongoose.disconnect();
		process.exit(1);
	}
	TOKEN = jwt.sign(
		{ id: String(admin._id), role: admin.role },
		process.env.JWT_SECRET,
		{ expiresIn: "10m" }
	);

	// Each section: how to create, what the list key is, how to update.
	const SECTIONS = [
		{
			label: "Promo Codes",
			base: "/promocodes",
			listKey: "promoCodes",
			itemKey: "promoCode",
			create: () => ({
				companyName: "Audit Co",
				code: "TEST" + uniq(),
				description: "temporary audit record",
				discountType: "percentage",
				discountValue: 10,
				validFrom: new Date().toISOString(),
				validUntil: new Date(Date.now() + 864e5).toISOString(),
				usageLimit: 5,
				isActive: true,
			}),
			update: { discountValue: 15 },
			verify: (o) => Number(o.discountValue) === 15,
		},
		{
			label: "Announcements",
			base: "/announcements",
			listKey: "announcements",
			itemKey: "announcement",
			create: () => ({
				title: "Audit " + uniq(),
				description: "temporary audit record",
				message: "temporary audit record",
				type: "info",
				isActive: true,
			}),
			update: { title: "Audit UPDATED" },
			verify: (o) => o.title === "Audit UPDATED",
		},
		{
			label: "Kitchen Categories",
			base: "/kitchen-categories",
			listKey: "categories",
			itemKey: "category",
			create: () => ({ name: "AuditCat " + uniq(), isActive: true }),
			update: { name: "AuditCat UPDATED" },
			verify: (o) => o.name === "AuditCat UPDATED",
		},
		{
			label: "For Kitchens",
			base: "/kitchens",
			listKey: "kitchens",
			itemKey: "kitchen",
			create: () => ({ name: "AuditKitchen " + uniq(), isActive: true }),
			update: { name: "AuditKitchen UPDATED" },
			verify: (o) => o.name === "AuditKitchen UPDATED",
		},
	];

	for (const s of SECTIONS) {
		console.log(`\n=== ${s.label} ===\n`);
		let id = null;

		// ---- READ (list) -------------------------------------------------
		const list = await api("GET", s.base);
		if (!list.ok) {
			fail(`${s.label}: LIST -> HTTP ${list.status} ${list.json?.message || ""}`);
		} else {
			const rows = listFrom(list.json, s.listKey);
			if (!Array.isArray(rows)) fail(`${s.label}: LIST did not yield an array`);
			else pass(`READ list -> ${rows.length} row(s)`);
		}

		// ---- CREATE ------------------------------------------------------
		const payload = s.create();
		const created = await api("POST", s.base, payload);
		if (!created.ok) {
			fail(
				`${s.label}: CREATE -> HTTP ${created.status} ` +
					`${created.json?.message || JSON.stringify(created.json?.errors || "")}`
			);
		} else {
			const rec = objectFrom(created.json, s.itemKey);
			id = rec && rec._id;
			if (!id) fail(`${s.label}: CREATE returned no record id`);
			else pass(`CREATE -> ${id}`);
		}

		// ---- READ (by id) ------------------------------------------------
		if (id) {
			const one = await api("GET", `${s.base}/${id}`);
			if (!one.ok) {
				fail(`${s.label}: READ by id -> HTTP ${one.status}`);
			} else {
				const rec = objectFrom(one.json, s.itemKey);
				if (!rec || String(rec._id) !== String(id))
					fail(`${s.label}: READ by id did not return the record`);
				else pass("READ by id");
			}
		}

		// ---- UPDATE ------------------------------------------------------
		if (id) {
			const upd = await api("PUT", `${s.base}/${id}`, s.update);
			if (!upd.ok) {
				fail(
					`${s.label}: UPDATE -> HTTP ${upd.status} ${upd.json?.message || ""}`
				);
			} else {
				// Re-read to confirm it actually persisted.
				const re = await api("GET", `${s.base}/${id}`);
				const rec = objectFrom(re.json, s.itemKey) || {};
				if (!s.verify(rec))
					fail(`${s.label}: UPDATE did not persist (got ${JSON.stringify(s.update)})`);
				else pass("UPDATE persisted");
			}
		}

		// ---- DELETE ------------------------------------------------------
		if (id) {
			const del = await api("DELETE", `${s.base}/${id}`);
			if (!del.ok) {
				fail(`${s.label}: DELETE -> HTTP ${del.status} ${del.json?.message || ""}`);
			} else {
				pass("DELETE");
			}
		}
	}

	// ---- Settings (read + write, no create/delete) -----------------------
	console.log("\n=== Settings ===\n");
	const sget = await api("GET", "/admin/settings");
	if (!sget.ok) {
		fail(`Settings: READ -> HTTP ${sget.status}`);
	} else {
		pass("READ settings");
		const supd = await api("PUT", "/admin/settings", {});
		if (!supd.ok) fail(`Settings: UPDATE -> HTTP ${supd.status} ${supd.json?.message || ""}`);
		else pass("UPDATE settings (no-op)");
	}

	// ---- Profile ---------------------------------------------------------
	console.log("\n=== Profile ===\n");
	const pget = await api("GET", "/auth/me");
	if (!pget.ok) fail(`Profile: READ -> HTTP ${pget.status}`);
	else pass("READ profile");

	// ---- Backup ----------------------------------------------------------
	console.log("\n=== Backup ===\n");
	const bres = await fetch(`${BASE}/backup`, {
		headers: { Authorization: `Bearer ${TOKEN}` },
	});
	if (!bres.ok) fail(`Backup: download -> HTTP ${bres.status}`);
	else {
		const len = (await bres.arrayBuffer()).byteLength;
		if (len === 0) fail("Backup: download returned an empty file");
		else pass(`download -> ${len} bytes`);
	}

	// ---- Waste (create needs a product, so read-only here) ---------------
	console.log("\n=== Waste Management ===\n");
	const wl = await api("GET", "/waste?limit=100");
	if (!wl.ok) fail(`Waste: LIST -> HTTP ${wl.status}`);
	else pass(`READ list -> ${listFrom(wl.json, "waste").length} row(s)`);
	const ws = await api("GET", "/waste/stats");
	if (!ws.ok) fail(`Waste: STATS -> HTTP ${ws.status}`);
	else pass("READ stats");

	await mongoose.disconnect();
	console.log(
		failures === 0 ? "\nALL CHECKS PASSED\n" : `\n${failures} CHECK(S) FAILED\n`
	);
	process.exit(failures === 0 ? 0 : 1);
})();
