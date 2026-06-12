require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const User = require("../src/models/User");

const OUT = path.join(__dirname, "_appcheck", "db-recent.txt");
const lines = [];
const log = (s) => lines.push(s);

(async () => {
	await mongoose.connect(process.env.MONGODB_URI);

	// Which DB are we actually connected to?
	log("Connected DB name: " + mongoose.connection.name);
	log("Connected host: " + mongoose.connection.host);

	// Most recently active users (proves whether the Render API writes here)
	const recent = await User.find({})
		.sort({ lastLogin: -1 })
		.select("email role lastLogin updatedAt fcmToken")
		.limit(8)
		.lean();

	log("\nMost recent logins in THIS database:");
	recent.forEach((u) => {
		log(
			`  ${u.email} | role=${u.role} | lastLogin=${
				u.lastLogin ? new Date(u.lastLogin).toISOString() : "never"
			} | hasToken=${u.fcmToken ? "YES" : "no"}`
		);
	});

	fs.writeFileSync(OUT, lines.join("\n") + "\n");
	await mongoose.disconnect();
})().catch((e) => {
	fs.writeFileSync(OUT, "ERROR: " + (e && e.message) + "\n");
	process.exit(1);
});
