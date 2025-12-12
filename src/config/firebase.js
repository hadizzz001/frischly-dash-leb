const admin = require("firebase-admin");

// Initialize Firebase Admin SDK
const initializeFirebase = () => {
	try {
		// Check if Firebase is already initialized
		if (admin.apps.length === 0) {
			// Use GOOGLE_APPLICATION_CREDENTIALS environment variable (recommended)
			// The SDK automatically detects and uses this environment variable
			admin.initializeApp({
				credential: admin.credential.applicationDefault(),
				projectId: "frischlyshop", // Explicitly set project ID
			});
		}
		console.log("🔥 Firebase Admin SDK initialized successfully");
		return admin;
	} catch (error) {
		console.error("❌ Error initializing Firebase:", error.message);
		return null;
	}
};

module.exports = initializeFirebase;
