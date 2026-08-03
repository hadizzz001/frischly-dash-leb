const mongoose = require("mongoose");
const archiver = require("archiver");
const { sendError, sendServerError } = require("../utils/apiResponse");

/**
 * Download a full database backup as a ZIP file.
 *
 * The backup contains one JSON file per MongoDB collection in the connected
 * database. Each JSON file is an array of documents from that collection.
 *
 * Access: any authenticated user whose role is NOT a driver
 * (i.e. not `rider` and not `market_driver`).
 */
exports.downloadBackup = async (req, res) => {
	try {
		// Block driver roles explicitly (defense-in-depth in addition to router auth)
		const role = req.user && req.user.role;
		if (role === "rider" || role === "market_driver") {
			return sendError(res, 403, "Drivers are not allowed to download backups");
		}

		const db = mongoose.connection && mongoose.connection.db;
		if (!db) {
			return sendError(res, 500, "Database connection is not ready");
		}

		// Build a friendly file name with a timestamp.
		const stamp = new Date()
			.toISOString()
			.replace(/[:.]/g, "-")
			.replace("T", "_")
			.slice(0, 19);
		const fileName = `frischly-backup-${stamp}.zip`;

		// Prepare the response as a zip stream download.
		res.setHeader("Content-Type", "application/zip");
		res.setHeader(
			"Content-Disposition",
			`attachment; filename="${fileName}"`
		);
		res.setHeader("Cache-Control", "no-store");

		const archive = archiver("zip", { zlib: { level: 9 } });

		archive.on("warning", (err) => {
			console.warn("[backup] archive warning:", err);
		});
		archive.on("error", (err) => {
			console.error("[backup] archive error:", err);
			try {
				res.status(500).end();
			} catch (_) {}
		});

		// Pipe archive data to the response.
		archive.pipe(res);

		// List collections in the current database and add each as a JSON file.
		const collections = await db
			.listCollections({}, { nameOnly: true })
			.toArray();

		// Sort for deterministic ordering inside the zip.
		collections.sort((a, b) => a.name.localeCompare(b.name));

		const manifest = {
			generatedAt: new Date().toISOString(),
			generatedBy: {
				id: req.user && (req.user.id || req.user._id),
				role: req.user && req.user.role,
				name: req.user && req.user.name,
			},
			database: db.databaseName,
			collections: [],
		};

		for (const coll of collections) {
			const name = coll.name;
			// Skip internal system collections.
			if (name.startsWith("system.")) continue;

			try {
				const docs = await db.collection(name).find({}).toArray();
				const json = JSON.stringify(docs, null, 2);
				archive.append(json, { name: `${name}.json` });
				manifest.collections.push({ name, count: docs.length });
			} catch (collErr) {
				console.error(
					`[backup] failed to export collection ${name}:`,
					collErr
				);
				manifest.collections.push({
					name,
					error: collErr.message || String(collErr),
				});
			}
		}

		// Add manifest file to the archive.
		archive.append(JSON.stringify(manifest, null, 2), {
			name: "_manifest.json",
		});

		await archive.finalize();
	} catch (error) {
		console.error("[backup] downloadBackup error:", error);
		if (!res.headersSent) {
			return sendServerError(res, error, "Failed to generate backup");
		}
		try {
			res.end();
		} catch (_) {}
	}
};
