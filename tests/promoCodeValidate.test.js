jest.mock("../src/models/PromoCode", () => ({ findOne: jest.fn() }));
jest.mock("../src/models/MarketPromoCode", () => ({ findOne: jest.fn(), find: jest.fn() }));
jest.mock("../src/models/Market", () => ({ findById: jest.fn() }));
jest.mock("../src/models/User", () => ({}));
jest.mock("../src/models/Order", () => ({ exists: jest.fn() }));

const PromoCode = require("../src/models/PromoCode");
const MarketPromoCode = require("../src/models/MarketPromoCode");
const Market = require("../src/models/Market");
const Order = require("../src/models/Order");

// `.select().lean()` chain used by the wrong-store lookup.
const lean = (value) => ({ select: () => ({ lean: async () => value }) });
const { validatePromoCode, hasCustomerUsedPromo } = require("../src/controllers/promoCodeController");

const createMockRes = () => {
	const res = { statusCode: null, body: null };
	res.status = jest.fn((code) => { res.statusCode = code; return res; });
	res.json = jest.fn((payload) => { res.body = payload; return res; });
	return res;
};
const req = (body) => ({ body, user: { id: "user-1" } });

beforeEach(() => jest.clearAllMocks());

describe("hasCustomerUsedPromo", () => {
	it("ignores cancelled orders and keys on createdBy", async () => {
		Order.exists.mockResolvedValue(null);
		expect(await hasCustomerUsedPromo("user-1", { promoCodeId: "p1" })).toBe(false);
		expect(Order.exists).toHaveBeenCalledWith({
			createdBy: "user-1",
			status: { $ne: "cancelled" },
			promoCode: "p1",
		});
	});
	it("is false without a user or a code id", async () => {
		expect(await hasCustomerUsedPromo(null, { promoCodeId: "p1" })).toBe(false);
		expect(await hasCustomerUsedPromo("user-1", {})).toBe(false);
		expect(Order.exists).not.toHaveBeenCalled();
	});
});

describe("validatePromoCode — main store", () => {
	const onetime = { _id: "p1", code: "ONCE10", isActive: true, isFromOwnCompany: false, discountType: "percentage", discountValue: 10, triggerCondition: { minOrderTotal: null } };
	const reusable = { _id: "p2", code: "ALWAYS5", isActive: true, isFromOwnCompany: true, discountType: "cash", discountValue: 5 };

	it("applies a onetime code the first time", async () => {
		PromoCode.findOne.mockResolvedValue(onetime);
		Order.exists.mockResolvedValue(null);
		const res = createMockRes();
		await validatePromoCode(req({ code: "once10", orderTotal: 40 }), res);
		expect(res.statusCode).toBe(200);
		expect(res.body.data.discountAmount).toBe(4);
	});

	it("rejects a onetime code the customer already redeemed", async () => {
		PromoCode.findOne.mockResolvedValue(onetime);
		Order.exists.mockResolvedValue({ _id: "order-1" });
		const res = createMockRes();
		await validatePromoCode(req({ code: "ONCE10", orderTotal: 40 }), res);
		expect(res.statusCode).toBe(400);
		expect(res.body.message).toMatch(/already used/i);
	});

	it("enforces the onetime minimum order total", async () => {
		PromoCode.findOne.mockResolvedValue({ ...onetime, triggerCondition: { minOrderTotal: 50 } });
		Order.exists.mockResolvedValue(null);
		const res = createMockRes();
		await validatePromoCode(req({ code: "ONCE10", orderTotal: 40 }), res);
		expect(res.statusCode).toBe(400);
		expect(res.body.message).toMatch(/Minimum order total/);
	});

	it("never consults order history for reusable codes", async () => {
		PromoCode.findOne.mockResolvedValue(reusable);
		const res = createMockRes();
		await validatePromoCode(req({ code: "always5", orderTotal: 40 }), res);
		expect(res.statusCode).toBe(200);
		expect(Order.exists).not.toHaveBeenCalled();
	});
});

describe("validatePromoCode — market cart", () => {
	const marketOnetime = { _id: "mp1", market: "m1", code: "MKT1", isActive: true, isFromOwnCompany: false, discountType: "cash", discountValue: 3, usageLimit: 0, usageCount: 0, minOrderTotal: 0 };

	it("rejects a market onetime code already used by this customer", async () => {
		MarketPromoCode.findOne.mockResolvedValue(marketOnetime);
		Order.exists.mockResolvedValue({ _id: "order-2" });
		const res = createMockRes();
		await validatePromoCode(req({ code: "mkt1", orderTotal: 20, market: "m1" }), res);
		expect(res.statusCode).toBe(400);
		expect(Order.exists).toHaveBeenCalledWith(expect.objectContaining({ marketPromoCode: "mp1" }));
	});

	it("applies a market onetime code on first use", async () => {
		MarketPromoCode.findOne.mockResolvedValue(marketOnetime);
		Order.exists.mockResolvedValue(null);
		const res = createMockRes();
		await validatePromoCode(req({ code: "mkt1", orderTotal: 20, market: "m1" }), res);
		expect(res.statusCode).toBe(200);
		expect(res.body.data.isMarketPromo).toBe(true);
	});
});

describe("validatePromoCode — wrong store explanations", () => {
	const marketCode = { _id: "m1", market: "market-B", isActive: true };

	it("names the market a code belongs to when used on a main-store cart", async () => {
		PromoCode.findOne
			.mockResolvedValueOnce(null) // the store lookup (code, isActive)
			.mockReturnValueOnce(lean(null)); // explain: no admin code either
		MarketPromoCode.find.mockReturnValue(lean([marketCode]));
		Market.findById.mockReturnValue(lean({ name: "Beirut mart 4" }));

		const res = createMockRes();
		await validatePromoCode(req({ code: " abc ", orderTotal: 100, market: null }), res);
		expect(res.statusCode).toBe(404);
		expect(res.body.message).toBe("This promo code belongs to Beirut mart 4 and only works on orders from that store");
		// trimmed + upper-cased before lookup
		expect(PromoCode.findOne).toHaveBeenCalledWith({ code: "ABC", isActive: true });
	});

	it("says a main-store code cannot be used on a market cart", async () => {
		MarketPromoCode.findOne.mockResolvedValue(null);
		PromoCode.findOne.mockReturnValue(lean({ isActive: true }));
		MarketPromoCode.find.mockReturnValue(lean([]));
		Market.findById.mockReturnValue(lean({ name: "Beirut mart" }));

		const res = createMockRes();
		await validatePromoCode(req({ code: "TST", orderTotal: 100, market: "market-A" }), res);
		expect(res.statusCode).toBe(404);
		expect(res.body.message).toBe("This promo code belongs to the main store and cannot be used on a Beirut mart order");
	});

	it("says a market code belongs to another market", async () => {
		MarketPromoCode.findOne.mockResolvedValue(null);
		PromoCode.findOne.mockReturnValue(lean(null));
		MarketPromoCode.find.mockReturnValue(lean([marketCode]));
		Market.findById.mockReturnValue(lean({ name: "Beirut mart 4" }));

		const res = createMockRes();
		await validatePromoCode(req({ code: "ABC", orderTotal: 100, market: "market-A" }), res);
		expect(res.statusCode).toBe(404);
		expect(res.body.message).toBe("This promo code belongs to Beirut mart 4 and only works on orders from that store");
	});

	it("reports an inactive code as inactive, not as belonging elsewhere", async () => {
		MarketPromoCode.findOne.mockResolvedValue(null);
		PromoCode.findOne.mockReturnValue(lean(null));
		MarketPromoCode.find.mockReturnValue(lean([{ ...marketCode, market: "market-A", isActive: false }]));

		const res = createMockRes();
		await validatePromoCode(req({ code: "ABC", orderTotal: 100, market: "market-A" }), res);
		expect(res.statusCode).toBe(404);
		expect(res.body.message).toBe("This promo code is inactive");
	});

	it("keeps the generic message for a code that exists nowhere", async () => {
		PromoCode.findOne.mockResolvedValueOnce(null).mockReturnValueOnce(lean(null));
		MarketPromoCode.find.mockReturnValue(lean([]));

		const res = createMockRes();
		await validatePromoCode(req({ code: "NOPE", orderTotal: 100, market: null }), res);
		expect(res.statusCode).toBe(404);
		expect(res.body.message).toBe("Invalid or inactive promo code");
	});
});
