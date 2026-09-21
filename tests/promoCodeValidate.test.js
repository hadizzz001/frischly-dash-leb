jest.mock("../src/models/PromoCode", () => ({ findOne: jest.fn() }));
jest.mock("../src/models/MarketPromoCode", () => ({ findOne: jest.fn() }));
jest.mock("../src/models/User", () => ({}));
jest.mock("../src/models/Order", () => ({ exists: jest.fn() }));

const PromoCode = require("../src/models/PromoCode");
const MarketPromoCode = require("../src/models/MarketPromoCode");
const Order = require("../src/models/Order");
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
