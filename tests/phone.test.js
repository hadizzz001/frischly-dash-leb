const {
	normalizeLebanonPhone,
	isPhoneLike,
} = require("../src/utils/phone");

describe("phone utility", () => {
	describe("normalizeLebanonPhone", () => {
		it("returns empty string for falsy input", () => {
			expect(normalizeLebanonPhone("")).toBe("");
			expect(normalizeLebanonPhone(null)).toBe("");
			expect(normalizeLebanonPhone(undefined)).toBe("");
		});

		it("converts 00961 prefix to +961", () => {
			expect(normalizeLebanonPhone("0096170123456")).toBe("+96170123456");
		});

		it("keeps an existing +961 number intact (stripping formatting)", () => {
			expect(normalizeLebanonPhone("+961 70 123 456")).toBe("+96170123456");
			expect(normalizeLebanonPhone("+961-70-123456")).toBe("+96170123456");
		});

		it("adds + to a 961-prefixed number typed without +", () => {
			expect(normalizeLebanonPhone("96170123456")).toBe("+96170123456");
		});

		it("converts a local number with leading 0 to +961 form", () => {
			expect(normalizeLebanonPhone("03123456")).toBe("+9613123456");
			expect(normalizeLebanonPhone("70123456")).toBe("+96170123456");
		});

		it("normalizes the same number typed in different ways to one value", () => {
			const canonical = normalizeLebanonPhone("+96170123456");
			expect(normalizeLebanonPhone("0096170123456")).toBe(canonical);
			expect(normalizeLebanonPhone("96170123456")).toBe(canonical);
			expect(normalizeLebanonPhone("+961 70 123 456")).toBe(canonical);
		});
	});

	describe("isPhoneLike", () => {
		it("returns false for empty / email values", () => {
			expect(isPhoneLike("")).toBe(false);
			expect(isPhoneLike(null)).toBe(false);
			expect(isPhoneLike("user@example.com")).toBe(false);
		});

		it("returns true for plausible phone strings", () => {
			expect(isPhoneLike("70123456")).toBe(true);
			expect(isPhoneLike("+961 70 123 456")).toBe(true);
			expect(isPhoneLike("03-123456")).toBe(true);
		});

		it("returns false for strings that are too short", () => {
			expect(isPhoneLike("123")).toBe(false);
		});
	});
});
