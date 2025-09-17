const fetch = require("node-fetch");

// Admin token - will be set after login
let token = "";

// Test product ID - will be set after creating a test product
let testProductId = "";

// Test data
const initialProductData = {
	name: "Image Test Product",
	description: "Testing image preservation on update",
	price: 15.99,
	tax: 5,
	discount: 0,
	bottlerefund: 1.5,
	stock: 50,
	isActive: true,
	subcategory: "679f8b8b8b8b8b8b8b8b8b8b", // Replace with valid subcategory ID
	barcode: `IMG${Date.now()}`,
	shelfNumber: "IMG-01",
	picture: "https://example.com/test-image.jpg", // Simulating an existing image
};

const updateDataWithoutImage = {
	name: "Updated Image Test Product",
	description: "Updated description without new image",
	price: 17.99,
	stock: 75,
};

// Login function
async function login() {
	try {
		const response = await fetch("http://localhost:3001/api/auth/login", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				email: "admin@frischly.com",
				password: "Admin123!",
			}),
		});

		const data = await response.json();

		if (!response.ok) {
			console.error("Login failed:", data.message);
			return false;
		}

		token = data.data.token;
		console.log("✅ Login successful");
		return true;
	} catch (error) {
		console.error("❌ Login error:", error);
		return false;
	}
}

// Create test product with initial image
async function createTestProduct() {
	try {
		console.log("\n🧪 Creating test product with initial image...");

		const response = await fetch("http://localhost:3001/api/products", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(initialProductData),
		});

		const data = await response.json();

		if (!response.ok) {
			console.error("❌ Product creation failed:", data.message);
			return null;
		}

		testProductId = data.data._id;
		console.log("✅ Test product created successfully");
		console.log("📦 Product ID:", testProductId);
		console.log("🖼️  Initial Image:", data.data.picture);

		return testProductId;
	} catch (error) {
		console.error("❌ Product creation error:", error);
		return null;
	}
}

// Update product without including picture field
async function updateProductWithoutImage() {
	try {
		console.log("\n🔄 Updating product without including picture field...");

		const response = await fetch(
			`http://localhost:3001/api/products/${testProductId}`,
			{
				method: "PUT",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(updateDataWithoutImage),
			}
		);

		const data = await response.json();

		if (!response.ok) {
			console.error("❌ Product update failed:", data.message);
			return null;
		}

		console.log("✅ Product updated successfully");
		console.log("📝 Updated Name:", data.data.name);
		console.log("💰 Updated Price:", data.data.price);
		console.log("🖼️  Image After Update:", data.data.picture);

		return data.data;
	} catch (error) {
		console.error("❌ Product update error:", error);
		return null;
	}
}

// Verify the image was preserved
async function verifyImagePreservation() {
	try {
		console.log("\n🔍 Verifying image preservation...");

		const response = await fetch(
			`http://localhost:3001/api/products/${testProductId}`,
			{
				method: "GET",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
			}
		);

		const data = await response.json();

		if (!response.ok) {
			console.error("❌ Product retrieval failed:", data.message);
			return false;
		}

		const product = data.data;
		const originalImage = initialProductData.picture;
		const currentImage = product.picture;

		console.log("🔍 Verification Results:");
		console.log("📊 Original Image:", originalImage);
		console.log("📈 Current Image:", currentImage);

		if (currentImage === originalImage) {
			console.log("✅ SUCCESS: Image was preserved during update!");
			return true;
		} else if (!currentImage || currentImage === "") {
			console.log("❌ FAILURE: Image was lost during update!");
			return false;
		} else {
			console.log("⚠️  WARNING: Image was changed unexpectedly!");
			return false;
		}
	} catch (error) {
		console.error("❌ Verification error:", error);
		return false;
	}
}

// Clean up test product
async function cleanupTestProduct() {
	try {
		console.log("\n🧹 Cleaning up test product...");

		const response = await fetch(
			`http://localhost:3001/api/products/${testProductId}`,
			{
				method: "DELETE",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
			}
		);

		if (response.ok) {
			console.log("✅ Test product deleted successfully");
		} else {
			console.log("⚠️  Could not delete test product, but test completed");
		}
	} catch (error) {
		console.log("⚠️  Cleanup error:", error);
	}
}

// Main test function
async function runImagePreservationTest() {
	console.log("🚀 Starting Image Preservation Test");
	console.log("==================================");

	// Login
	if (!(await login())) {
		console.log("❌ Test failed: Could not login");
		return;
	}

	// Create test product
	if (!(await createTestProduct())) {
		console.log("❌ Test failed: Could not create test product");
		return;
	}

	// Update product without image
	const updatedProduct = await updateProductWithoutImage();
	if (!updatedProduct) {
		console.log("❌ Test failed: Could not update product");
		await cleanupTestProduct();
		return;
	}

	// Verify image preservation
	const imagePreserved = await verifyImagePreservation();

	if (imagePreserved) {
		console.log("\n🎉 IMAGE PRESERVATION TEST PASSED!");
		console.log(
			"✅ Existing images are correctly preserved when updating products without selecting new images."
		);
	} else {
		console.log("\n❌ IMAGE PRESERVATION TEST FAILED!");
		console.log("❌ Images are not being preserved correctly during updates.");
	}

	// Cleanup
	await cleanupTestProduct();

	console.log("\n🏁 Image Preservation Test Completed");
}

// Run the test
runImagePreservationTest().catch(console.error);
