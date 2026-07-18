const {
	sanitizeObject,
	isValidObjectId,
	sanitizeString,
	sanitizeEmail,
	sanitizeQuery,
	sanitizePagination,
	sanitizeSort,
	createSafeRegex,
} = require("../src/utils/sanitize");

describe("sanitize utility", () => {
	describe("sanitizeObject", () => {
		it("strips MongoDB operator keys ($gt, $where, ...)", () => {
			const result = sanitizeObject({ name: "x", $gt: "", price: 5 });
			expect(result).toHaveProperty("name", "x");
			expect(result).toHaveProperty("price", 5);
			expect(result).not.toHaveProperty("$gt");
		});

		it("strips dotted keys and prototype-pollution keys", () => {
			const result = sanitizeObject({
				"user.password": "secret",
				__proto__: { admin: true },
				constructor: 1,
				ok: true,
			});
			expect(result).not.toHaveProperty("user.password");
			expect(Object.prototype.hasOwnProperty.call(result, "constructor")).toBe(
				false,
			);
			expect(result).toHaveProperty("ok", true);
		});

		it("recurses into nested objects and arrays", () => {
			const result = sanitizeObject({
				list: [{ $ne: 1, keep: "a" }],
				nested: { $or: [], value: 2 },
			});
			expect(result.list[0]).not.toHaveProperty("$ne");
			expect(result.list[0]).toHaveProperty("keep", "a");
			expect(result.nested).not.toHaveProperty("$or");
			expect(result.nested).toHaveProperty("value", 2);
		});

		it("returns primitives untouched", () => {
			expect(sanitizeObject("hello")).toBe("hello");
			expect(sanitizeObject(42)).toBe(42);
			expect(sanitizeObject(null)).toBeNull();
		});
	});

	describe("isValidObjectId", () => {
		it("accepts a valid 24-char hex string", () => {
			expect(isValidObjectId("507f1f77bcf86cd799439011")).toBe(true);
		});

		it("rejects invalid values", () => {
			expect(isValidObjectId("123")).toBe(false);
			expect(isValidObjectId("")).toBe(false);
			expect(isValidObjectId(null)).toBe(false);
			expect(isValidObjectId({ $gt: "" })).toBe(false);
		});
	});

	describe("sanitizeString", () => {
		it("trims and removes HTML tags by default", () => {
			expect(sanitizeString("  <b>hi</b>  ")).toBe("hi");
		});

		it("keeps HTML when allowHtml is true", () => {
			expect(sanitizeString("<b>hi</b>", { allowHtml: true })).toBe("<b>hi</b>");
		});

		it("truncates to maxLength", () => {
			expect(sanitizeString("abcdef", { maxLength: 3 })).toBe("abc");
		});

		it("removes null bytes", () => {
			expect(sanitizeString("a\0b")).toBe("ab");
		});
	});

	describe("sanitizeEmail", () => {
		it("lowercases and trims a valid email", () => {
			expect(sanitizeEmail("  User@Example.COM ")).toBe("user@example.com");
		});

		it("returns null for invalid emails", () => {
			expect(sanitizeEmail("not-an-email")).toBeNull();
			expect(sanitizeEmail(123)).toBeNull();
		});
	});

	describe("sanitizeQuery", () => {
		it("drops dangerous keys and sanitizes string values", () => {
			const result = sanitizeQuery({ $gt: "1", "a.b": "x", name: "  ok  " });
			expect(result).not.toHaveProperty("$gt");
			expect(result).not.toHaveProperty("a.b");
			expect(result.name).toBe("ok");
		});
	});

	describe("sanitizePagination", () => {
		it("defaults to page 1 / limit 20", () => {
			expect(sanitizePagination()).toEqual({ page: 1, limit: 20 });
		});

		it("clamps to allowed bounds", () => {
			expect(sanitizePagination({ page: -5, limit: 9999 })).toEqual({
				page: 1,
				limit: 100,
			});
		});
	});

	describe("sanitizeSort", () => {
		it("returns defaults when nothing valid is provided", () => {
			expect(sanitizeSort()).toEqual({ field: "createdAt", order: "desc" });
		});

		it("honors allowed fields and asc order", () => {
			expect(sanitizeSort("price", "asc", ["price", "name"])).toEqual({
				field: "price",
				order: "asc",
			});
		});

		it("rejects a field not in the allow-list", () => {
			const result = sanitizeSort("secret", "asc", ["price"]);
			expect(result.field).toBe("createdAt");
		});

		it("strips operators from the sort field", () => {
			const result = sanitizeSort("$where", "desc", []);
			expect(result.field).not.toContain("$");
		});
	});

	describe("createSafeRegex", () => {
		it("escapes special regex characters (ReDoS/injection safe)", () => {
			const re = createSafeRegex("a.*b");
			expect(re).toBeInstanceOf(RegExp);
			expect(re.test("a.*b")).toBe(true);
			expect(re.test("axxb")).toBe(false);
		});

		it("returns null for non-string input", () => {
			expect(createSafeRegex(123)).toBeNull();
		});
	});
});
