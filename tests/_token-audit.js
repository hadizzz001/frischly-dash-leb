require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../src/models/User");

(async () => {
	await mongoose.connect(process.env.MONGODB_URI);

	const total = await User.countDocuments();
	const withToken = await User.countDocuments({ fcmToken: { $ne: null } });

	console.log("Total users:", total);
	console.log("Users WITH a token:", withToken);
	console.log("Users WITHOUT a token:", total - withToken);

	const samples = await User.find({ fcmToken: { $ne: null } })
		.select("email role fcmToken")
		.limit(10)
		.lean();

	console.log("\nSample tokens (type only, masked):");
	if (samples.length === 0) {
		console.log(
			"  (none - NO user in the database has ever registered a push token)"
		);
	} else {
		samples.forEach((u) => {
			const t = u.fcmToken || "";
			const type = t.startsWith("ExponentPushToken[")
				? "EXPO"
				: t.length > 100
				? "FCM(native)"
				: "UNKNOWN";
			console.log(
				`  ${u.role} | ${u.email} | ${type} | ${t.slice(0, 22)}...`
			);
		});
	}

	await mongoose.disconnect();
})().catch((e) => {
	console.error(e);
	process.exit(1);
});
