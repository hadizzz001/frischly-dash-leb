const mongoose = require("mongoose");
const User = require("../src/models/User");
require("dotenv").config();

async function checkUsers() {
	await mongoose.connect(process.env.MONGODB_URI);

	console.log("Users in database:");
	const users = await User.find({});
	users.forEach((u) => console.log(`- ${u.name} (${u.email}) - ID: ${u._id}`));

	mongoose.disconnect();
}

checkUsers().catch(console.error);
