const fs = require("fs");
const path = require("path");

console.log("🔍 Frischly Deployment Readiness Check\n");

// Check if required files exist
const requiredFiles = [
	"public/_redirects",
	"netlify.toml",
	"DEPLOYMENT-GUIDE.md",
];

let allFilesExist = true;

requiredFiles.forEach((file) => {
	if (fs.existsSync(file)) {
		console.log(`✅ ${file} exists`);
	} else {
		console.log(`❌ ${file} missing`);
		allFilesExist = false;
	}
});

// Check API URLs in frontend files
const frontendFiles = [
	"public/dashboard.html",
	"public/signin.html",
	"public/signup.html",
];

console.log("\n📁 Checking API URLs in frontend files:");

frontendFiles.forEach((file) => {
	if (fs.existsSync(file)) {
		const content = fs.readFileSync(file, "utf8");
		if (content.includes("localhost:3001")) {
			console.log(
				`⚠️  ${file} still uses localhost - needs updating for production`
			);
		} else if (content.includes("API_BASE_URL")) {
			console.log(`✅ ${file} has API_BASE_URL configured`);
		} else {
			console.log(`❓ ${file} - API URL configuration unclear`);
		}
	}
});

// Check package.json scripts
console.log("\n📦 Package.json scripts:");
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

if (packageJson.scripts["prepare-deploy"]) {
	console.log("✅ prepare-deploy script available");
} else {
	console.log("❌ prepare-deploy script missing");
}

if (packageJson.scripts["build"]) {
	console.log("✅ build script available");
} else {
	console.log("❌ build script missing");
}

console.log("\n🎯 Deployment Status:");
if (allFilesExist) {
	console.log("✅ All deployment files are ready");
	console.log("\n📋 Next steps:");
	console.log("1. Deploy backend to Render/Railway");
	console.log("2. Update API URLs in frontend files");
	console.log("3. Deploy frontend to Netlify");
	console.log("\n📖 Read DEPLOYMENT-GUIDE.md for detailed instructions");
} else {
	console.log("❌ Some deployment files are missing");
	console.log("Run the setup again to create missing files");
}

console.log("\n🔗 Useful links:");
console.log("- Netlify: https://netlify.com");
console.log("- Render: https://render.com");
console.log("- MongoDB Atlas: https://mongodb.com/atlas");
