const { sendResponse, sendError, sendSuccess } = require("../src/utils/apiResponse");

// Minimal Express Response mock
const createMockRes = () => {
	const res = {};
	res.statusCode = null;
	res.body = null;
	res.status = jest.fn((code) => {
		res.statusCode = code;
		return res;
	});
	res.json = jest.fn((payload) => {
		res.body = payload;
		return res;
	});
	return res;
};

describe("apiResponse utility", () => {
	describe("sendResponse", () => {
		it("sets the given status code and returns a standardized envelope", () => {
			const res = createMockRes();
			sendResponse(res, 200, true, "User queried successfully", { id: "1" });

			expect(res.status).toHaveBeenCalledWith(200);
			expect(res.body.success).toBe(true);
			expect(res.body.message).toBe("User queried successfully");
			expect(res.body.data).toEqual({ id: "1" });
			expect(typeof res.body.timestamp).toBe("string");
			expect(new Date(res.body.timestamp).toString()).not.toBe("Invalid Date");
		});

		it("defaults data to null when not provided", () => {
			const res = createMockRes();
			sendResponse(res, 204, true, "No content");
			expect(res.body.data).toBeNull();
		});

		it("spreads meta fields at the top level (preserves legacy fields)", () => {
			const res = createMockRes();
			sendResponse(res, 200, true, "Products fetched", null, {
				products: [1, 2, 3],
				page: 2,
				totalPages: 5,
			});

			expect(res.body.products).toEqual([1, 2, 3]);
			expect(res.body.page).toBe(2);
			expect(res.body.totalPages).toBe(5);
			expect(res.body.data).toBeNull();
		});
	});

	describe("sendError", () => {
		it("returns a failure envelope with default 500 status", () => {
			const res = createMockRes();
			sendError(res);
			expect(res.status).toHaveBeenCalledWith(500);
			expect(res.body.success).toBe(false);
			expect(res.body.message).toBe("Internal server error");
			expect(res.body.errors).toBeNull();
		});

		it("passes through custom status, message and error details", () => {
			const res = createMockRes();
			sendError(res, 404, "User not found", { field: "id" });
			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.body.message).toBe("User not found");
			expect(res.body.errors).toEqual({ field: "id" });
		});
	});

	describe("sendSuccess", () => {
		it("wraps data with a 200 status by default", () => {
			const res = createMockRes();
			sendSuccess(res, { ok: true });
			expect(res.status).toHaveBeenCalledWith(200);
			expect(res.body.success).toBe(true);
			expect(res.body.data).toEqual({ ok: true });
		});

		it("allows overriding message and status code", () => {
			const res = createMockRes();
			sendSuccess(res, null, "Created", 201);
			expect(res.status).toHaveBeenCalledWith(201);
			expect(res.body.message).toBe("Created");
		});
	});
});
