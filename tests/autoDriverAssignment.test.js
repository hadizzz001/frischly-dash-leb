// The service reaches for Rider/Zone and the hard coverage check, so those are
// mocked here; the zone maths itself is covered by tests/autoAssign.test.js.
jest.mock("../src/models/Rider", () => ({
	getRidersWithStats: jest.fn(),
	findOne: jest.fn(),
}));
jest.mock("../src/models/Zone", () => ({ find: jest.fn() }));
jest.mock("../src/utils/zoneGeo", () => {
	const actual = jest.requireActual("../src/utils/zoneGeo");
	return { ...actual, riderCoversOrder: jest.fn() };
});

const Rider = require("../src/models/Rider");
const Zone = require("../src/models/Zone");
const { riderCoversOrder } = require("../src/utils/zoneGeo");
const mongoose = require("mongoose");
const { autoAssignDriverForOrder, RESULT } = require("../src/services/autoDriverAssignment");

const zoneA = { _id: "zA", zoneName: "Zone A", distance: 5, distanceUnit: "km", coordinates: { latitude: 33.8938, longitude: 35.5018 }, isActive: true };

const readyOrder = (overrides = {}) => ({
	_id: "o1",
	orderNumber: "ORD-1",
	status: "ready for pickup",
	assignedRider: null,
	market: null,
	customer: { name: "C", address: { city: "Beirut", location: { latitude: 33.894, longitude: 35.502 } } },
	...overrides,
});

const rider = (id, name, zones, extra = {}) => ({
	_id: id, userInfo: { name }, zones, status: "available", isActive: true, activeOrdersCount: 0, ...extra,
});

const mockWorld = ({ zones = [zoneA], riders = [], covers = true } = {}) => {
	Zone.find.mockReturnValue({ lean: () => Promise.resolve(zones) });
	Rider.getRidersWithStats.mockResolvedValue(riders);
	Rider.findOne.mockImplementation((q) => ({
		select: () => Promise.resolve(riders.find((r) => String(r._id) === String(q._id)) || null),
	}));
	riderCoversOrder.mockResolvedValue({ covers, reason: covers ? null : "out of coverage" });
};

beforeEach(() => jest.clearAllMocks());

describe("autoAssignDriverForOrder", () => {
	it("attaches the zone's driver when the order becomes ready for pickup", async () => {
		mockWorld({ riders: [rider("rA", "Driver A", ["Zone A"])] });
		const order = readyOrder();
		const res = await autoAssignDriverForOrder(order, { actorId: "u1" });

		expect(res.state).toBe(RESULT.ASSIGNED);
		expect(res.riderName).toBe("Driver A");
		expect(res.zoneName).toBe("Zone A");
		expect(String(order.assignedRider)).toBe("rA");
		expect(order.riderAssignedAt).toBeInstanceOf(Date);
		expect(order.updatedBy).toBe("u1");
	});

	it("dispatches the order in the same step — nothing left to press", async () => {
		mockWorld({ riders: [rider("rA", "Driver A", ["Zone A"])] });
		const order = readyOrder();
		const res = await autoAssignDriverForOrder(order);
		expect(order.status).toBe("OnTheWay");
		expect(res.dispatched).toBe(true);
	});

	it("leaves the status alone when no driver could be found", async () => {
		mockWorld({ riders: [rider("rB", "Driver B", ["Zone B"])] });
		const order = readyOrder();
		await autoAssignDriverForOrder(order);
		expect(order.status).toBe("ready for pickup");
		expect(order.assignedRider).toBeNull();
	});

	it("picks the most dedicated, then least loaded, driver", async () => {
		mockWorld({
			riders: [
				rider("rF", "Floater", ["Zone A", "Zone B", "Zone C"]),
				rider("rBusy", "Busy A", ["Zone A"], { activeOrdersCount: 9 }),
				rider("rFree", "Free A", ["Zone A"], { activeOrdersCount: 1 }),
			],
		});
		const res = await autoAssignDriverForOrder(readyOrder());
		expect(res.riderName).toBe("Free A");
	});

	it("is a no-op for any status other than ready for pickup", async () => {
		mockWorld({ riders: [rider("rA", "Driver A", ["Zone A"])] });
		const order = readyOrder({ status: "processing" });
		const res = await autoAssignDriverForOrder(order);
		expect(res.state).toBe(RESULT.NOT_READY);
		expect(order.assignedRider).toBeNull();
		expect(Zone.find).not.toHaveBeenCalled();
	});

	it("never overwrites a driver the order already has", async () => {
		mockWorld({ riders: [rider("rA", "Driver A", ["Zone A"])] });
		const order = readyOrder({ assignedRider: "someoneElse" });
		const res = await autoAssignDriverForOrder(order);
		expect(res.state).toBe(RESULT.ALREADY_ASSIGNED);
		expect(order.assignedRider).toBe("someoneElse");
	});

	it("assigns a market order from that market's own driver pool", async () => {
		const marketId = new mongoose.Types.ObjectId();
		mockWorld({ riders: [rider("rM", "Market Driver", ["Zone A"])] });
		const order = readyOrder({ market: marketId });
		const res = await autoAssignDriverForOrder(order);

		expect(res.state).toBe(RESULT.ASSIGNED);
		expect(res.riderName).toBe("Market Driver");
		// Both the zone lookup and the driver lookup must be scoped to that market,
		// or a market order could reach a main-store driver.
		expect(Zone.find).toHaveBeenCalledWith(
			expect.objectContaining({ isActive: true, market: expect.anything() }),
		);
		const zoneScope = Zone.find.mock.calls[0][0];
		expect(String(zoneScope.market)).toBe(String(marketId));
		const riderScope = Rider.getRidersWithStats.mock.calls[0][0];
		expect(String(riderScope.market)).toBe(String(marketId));
	});

	it("scopes a main-store order to documents with no market", async () => {
		mockWorld({ riders: [rider("rA", "Driver A", ["Zone A"])] });
		await autoAssignDriverForOrder(readyOrder({ market: null }));

		const zoneScope = Zone.find.mock.calls[0][0];
		const riderScope = Rider.getRidersWithStats.mock.calls[0][0];
		expect(zoneScope.market).toBeUndefined();
		expect(zoneScope.$or).toEqual([{ market: null }, { market: { $exists: false } }]);
		expect(riderScope.$or).toEqual([{ market: null }, { market: { $exists: false } }]);
	});

	it("casts a string market id to an ObjectId for the driver aggregation", async () => {
		// Rider.getRidersWithStats feeds this into an aggregation $match, which
		// does not cast — a raw string there would match no drivers at all.
		const marketId = new mongoose.Types.ObjectId();
		mockWorld({ riders: [rider("rM", "Market Driver", ["Zone A"])] });
		await autoAssignDriverForOrder(readyOrder({ market: String(marketId) }));

		const riderScope = Rider.getRidersWithStats.mock.calls[0][0];
		expect(riderScope.market).toBeInstanceOf(mongoose.Types.ObjectId);
		expect(String(riderScope.market)).toBe(String(marketId));
	});

	it("explains a zone nobody covers", async () => {
		mockWorld({ riders: [rider("rB", "Driver B", ["Zone B"])] });
		const res = await autoAssignDriverForOrder(readyOrder());
		expect(res.state).toBe(RESULT.NO_DRIVER);
		expect(res.zoneName).toBe("Zone A");
		expect(res.message).toMatch(/not covered by any available driver/);
	});

	it("explains a location outside every zone", async () => {
		mockWorld({ riders: [rider("rA", "Driver A", ["Zone A"])] });
		const order = readyOrder({ customer: { address: { city: "Tyre", location: { latitude: 33.27, longitude: 35.2 } } } });
		const res = await autoAssignDriverForOrder(order);
		expect(res.state).toBe(RESULT.NO_ZONE);
		expect(res.message).toMatch(/outside every active delivery zone/);
		expect(order.assignedRider).toBeNull();
	});

	it("explains an order with no usable location", async () => {
		mockWorld({ riders: [rider("rA", "Driver A", ["Zone A"])] });
		const order = readyOrder({ customer: { address: {} } });
		const res = await autoAssignDriverForOrder(order);
		expect(res.state).toBe(RESULT.NO_LOCATION);
		expect(Zone.find).not.toHaveBeenCalled();
	});

	it("falls through to the next driver when the hard coverage check rejects the first", async () => {
		mockWorld({
			riders: [rider("rA", "Driver A", ["Zone A"]), rider("rA2", "Driver A2", ["Zone A"], { activeOrdersCount: 5 })],
		});
		riderCoversOrder
			.mockResolvedValueOnce({ covers: false, reason: "out of coverage" })
			.mockResolvedValueOnce({ covers: true, reason: null });

		const res = await autoAssignDriverForOrder(readyOrder());
		expect(res.state).toBe(RESULT.ASSIGNED);
		expect(res.riderName).toBe("Driver A2");
	});

	it("reports no driver when every candidate fails the coverage check", async () => {
		mockWorld({ riders: [rider("rA", "Driver A", ["Zone A"])], covers: false });
		const order = readyOrder();
		const res = await autoAssignDriverForOrder(order);
		expect(res.state).toBe(RESULT.NO_DRIVER);
		expect(order.assignedRider).toBeNull();
	});

	it("does not count offline drivers as available", async () => {
		mockWorld({ riders: [rider("rA", "Driver A", ["Zone A"], { status: "offline" })] });
		const res = await autoAssignDriverForOrder(readyOrder());
		expect(res.state).toBe(RESULT.NO_DRIVER);
	});
});
