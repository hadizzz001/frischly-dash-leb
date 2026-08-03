require("dotenv").config();
const m = require("mongoose");
(async () => {
	await m.connect(process.env.MONGODB_URI);
	const s = await m.connection.db.collection("settings").findOne({});
	const mk = await m.connection.db
		.collection("markets")
		.findOne({ username: "tester111" });
	console.log(
		`${process.argv[2] || ""} minOrder=${s.minimumOrderValue} pins=${
			(s.deliveryRegions || []).length
		} marketPins=${((mk && mk.deliveryRegions) || []).length}`
	);
	await m.disconnect();
})();
