// Test slug generation
let name = "7687";
let baseSlug = name
	.toLowerCase()
	.trim()
	.replace(/[^a-z0-9\s-]/g, "") // Remove special characters
	.replace(/\s+/g, "-") // Replace spaces with hyphens
	.replace(/-+/g, "-") // Replace multiple hyphens with single
	.replace(/^-|-$/g, ""); // Remove leading/trailing hyphens

console.log("Name:", name);
console.log("Base slug:", baseSlug);
console.log("Final slug:", baseSlug || "subcategory");

// Test with another name
name = "Test Subcategory";
baseSlug = name
	.toLowerCase()
	.trim()
	.replace(/[^a-z0-9\s-]/g, "")
	.replace(/\s+/g, "-")
	.replace(/-+/g, "-")
	.replace(/^-|-$/g, "");

console.log("\nName:", name);
console.log("Base slug:", baseSlug);
console.log("Final slug:", baseSlug || "subcategory");
