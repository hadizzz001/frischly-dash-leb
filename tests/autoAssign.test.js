const {
	planAssignments,
	zoneForPoint,
	resolveOrderPoint,
	coverageForOrders,
	COVERAGE,
} = require("../src/utils/autoAssign");

// Two 5 km zones ~11 km apart, so they do not overlap.
const zoneA = { _id: "zA", zoneName: "Zone A", distance: 5, distanceUnit: "km", coordinates: { latitude: 33.8938, longitude: 35.5018 }, isActive: true };
const zoneB = { _id: "zB", zoneName: "Zone B", distance: 5, distanceUnit: "km", coordinates: { latitude: 33.98, longitude: 35.61 }, isActive: true };

const order = (n, lat, lng) => ({
	_id: "o" + n,
	orderNumber: "ORD-" + n,
	customer: { name: "C" + n, address: { city: "Beirut", location: { latitude: lat, longitude: lng } } },
});

const rider = (id, name, zones, extra = {}) => ({
	_id: id, userInfo: { name }, zones, status: "available", isActive: true, activeOrdersCount: 0, ...extra,
});

const inA = [order(1, 33.894, 35.502), order(2, 33.89, 35.498), order(3, 33.9, 35.51)];
const inB = [order(4, 33.9805, 35.6105), order(5, 33.975, 35.605)];
const allOrders = [...inA, ...inB];

const zoneNamed = (plan, name) => plan.groups.find((g) => g.zoneName === name);
const driverOf = (group) => (group && group.rider ? group.rider.userInfo.name : null);

describe("resolveOrderPoint", () => {
	it("prefers the customer's exact pin", () => {
		expect(resolveOrderPoint(order(1, 33.894, 35.502))).toEqual({ lat: 33.894, lng: 35.502, source: "pin" });
	});

	it("falls back to the delivery city centre", () => {
		const point = resolveOrderPoint({ customer: { address: { city: "Beirut" } } });
		expect(point && point.source).toBe("city");
	});

	it("returns null when there is nothing to go on", () => {
		expect(resolveOrderPoint({ customer: { address: {} } })).toBeNull();
	});
});

describe("zoneForPoint", () => {
	it("picks the tightest covering circle when zones overlap", () => {
		const big = { _id: "zBig", zoneName: "All Beirut", distance: 40, distanceUnit: "km", coordinates: { latitude: 33.8938, longitude: 35.5018 }, isActive: true };
		expect(zoneForPoint([big, zoneA], 33.894, 35.502).zoneName).toBe("Zone A");
	});

	it("returns null outside every zone", () => {
		expect(zoneForPoint([zoneA, zoneB], 34.7, 36.2)).toBeNull();
	});

	it("ignores zones with no pin or radius", () => {
		const noGeo = { _id: "z0", zoneName: "Unmapped", distance: 0, isActive: true };
		expect(zoneForPoint([noGeo], 33.894, 35.502)).toBeNull();
	});
});

describe("planAssignments", () => {
	it("sends each zone's orders to that zone's driver", () => {
		const plan = planAssignments({
			orders: allOrders,
			riders: [rider("rA", "Driver A", ["Zone A"]), rider("rB", "Driver B", ["Zone B"])],
			zoneDocs: [zoneA, zoneB],
		});
		expect(driverOf(zoneNamed(plan, "Zone A"))).toBe("Driver A");
		expect(driverOf(zoneNamed(plan, "Zone B"))).toBe("Driver B");
		expect(zoneNamed(plan, "Zone A").entries).toHaveLength(3);
		expect(zoneNamed(plan, "Zone B").entries).toHaveLength(2);
		expect(plan.unassignable).toHaveLength(0);
	});

	it("does not let a driver covering both zones absorb both", () => {
		const plan = planAssignments({
			orders: allOrders,
			riders: [rider("rF", "Floater", ["Zone A", "Zone B"]), rider("rA", "Driver A", ["Zone A"])],
			zoneDocs: [zoneA, zoneB],
		});
		expect(driverOf(zoneNamed(plan, "Zone A"))).toBe("Driver A");
		expect(driverOf(zoneNamed(plan, "Zone B"))).toBe("Floater");
	});

	it("gives a zone to its least-loaded dedicated driver", () => {
		const plan = planAssignments({
			orders: allOrders,
			riders: [
				rider("r1", "Busy A", ["Zone A"], { activeOrdersCount: 7 }),
				rider("r2", "Free A", ["Zone A"], { activeOrdersCount: 1 }),
				rider("rB", "Driver B", ["Zone B"]),
			],
			zoneDocs: [zoneA, zoneB],
		});
		expect(driverOf(zoneNamed(plan, "Zone A"))).toBe("Free A");
	});

	it("reports a zone with no eligible driver instead of dropping it", () => {
		const plan = planAssignments({
			orders: allOrders,
			riders: [rider("rA", "Driver A", ["Zone A"])],
			zoneDocs: [zoneA, zoneB],
		});
		const b = zoneNamed(plan, "Zone B");
		expect(b.rider).toBeNull();
		expect(b.reason).toMatch(/No active driver/);
		expect(driverOf(zoneNamed(plan, "Zone A"))).toBe("Driver A");
	});

	it("skips offline and on-break drivers but keeps busy ones", () => {
		const plan = planAssignments({
			orders: inA,
			riders: [
				rider("r1", "Offline A", ["Zone A"], { status: "offline" }),
				rider("r2", "Break A", ["Zone A"], { status: "on-break" }),
				rider("r3", "Busy A", ["Zone A"], { status: "busy" }),
			],
			zoneDocs: [zoneA],
		});
		expect(driverOf(zoneNamed(plan, "Zone A"))).toBe("Busy A");
	});

	it("explains orders that cannot be placed in any zone", () => {
		const far = order(9, 34.7, 36.2);
		const noLocation = { _id: "o10", orderNumber: "ORD-10", customer: { name: "C", address: {} } };
		const plan = planAssignments({
			orders: [inA[0], far, noLocation],
			riders: [rider("rA", "Driver A", ["Zone A"])],
			zoneDocs: [zoneA, zoneB],
		});
		expect(plan.unassignable).toHaveLength(2);
		expect(plan.unassignable.every((u) => typeof u.reason === "string" && u.reason.length)).toBe(true);
		expect(driverOf(zoneNamed(plan, "Zone A"))).toBe("Driver A");
	});

	it("spreads three zones across three dedicated drivers", () => {
		const zoneC = { _id: "zC", zoneName: "Zone C", distance: 5, distanceUnit: "km", coordinates: { latitude: 34.12, longitude: 35.65 }, isActive: true };
		const plan = planAssignments({
			orders: [...allOrders, order(6, 34.1205, 35.6505)],
			riders: [rider("rA", "Driver A", ["Zone A"]), rider("rB", "Driver B", ["Zone B"]), rider("rC", "Driver C", ["Zone C"])],
			zoneDocs: [zoneA, zoneB, zoneC],
		});
		expect(new Set(plan.groups.map((g) => String(g.rider._id))).size).toBe(3);
	});

	it("handles having nothing to do", () => {
		const plan = planAssignments({ orders: [], riders: [], zoneDocs: [] });
		expect(plan.groups).toHaveLength(0);
		expect(plan.unassignable).toHaveLength(0);
	});
});

describe("coverageForOrders", () => {
	const stateOf = (map, id) => (map.get(id) || {}).state;

	it("marks an order covered when a driver has its zone", () => {
		const map = coverageForOrders({
			orders: [inA[0]],
			riders: [rider("rA", "Driver A", ["Zone A"])],
			zoneDocs: [zoneA],
		});
		expect(stateOf(map, "o1")).toBe(COVERAGE.COVERED);
		expect(map.get("o1").zoneName).toBe("Zone A");
		expect(map.get("o1").driverCount).toBe(1);
		expect(map.get("o1").message).toBeNull();
	});

	it("flags a zone that exists but has no driver", () => {
		const map = coverageForOrders({
			orders: [inB[0]],
			riders: [rider("rA", "Driver A", ["Zone A"])],
			zoneDocs: [zoneA, zoneB],
		});
		const info = map.get("o4");
		expect(info.state).toBe(COVERAGE.NO_DRIVER);
		expect(info.zoneName).toBe("Zone B");
		expect(info.message).toMatch(/not covered by any available driver/);
	});

	it("flags a location outside every zone", () => {
		const map = coverageForOrders({
			orders: [order(9, 34.7, 36.2)],
			riders: [rider("rA", "Driver A", ["Zone A"])],
			zoneDocs: [zoneA, zoneB],
		});
		expect(stateOf(map, "o9")).toBe(COVERAGE.NO_ZONE);
		expect(map.get("o9").message).toMatch(/outside every active delivery zone/);
	});

	it("flags an order with no usable location", () => {
		const map = coverageForOrders({
			orders: [{ _id: "o10", orderNumber: "ORD-10", customer: { address: {} } }],
			riders: [rider("rA", "Driver A", ["Zone A"])],
			zoneDocs: [zoneA],
		});
		expect(stateOf(map, "o10")).toBe(COVERAGE.NO_LOCATION);
	});

	it("does not count offline or on-break drivers as coverage", () => {
		const map = coverageForOrders({
			orders: [inA[0]],
			riders: [
				rider("r1", "Offline", ["Zone A"], { status: "offline" }),
				rider("r2", "Break", ["Zone A"], { status: "on-break" }),
			],
			zoneDocs: [zoneA],
		});
		expect(stateOf(map, "o1")).toBe(COVERAGE.NO_DRIVER);
	});

	it("agrees with planAssignments about which orders cannot be placed", () => {
		const orders = [...inA, ...inB, order(9, 34.7, 36.2)];
		const riders = [rider("rA", "Driver A", ["Zone A"])];
		const zoneDocs = [zoneA, zoneB];
		const plan = planAssignments({ orders, riders, zoneDocs });
		const map = coverageForOrders({ orders, riders, zoneDocs });

		const blockedByPlan = new Set([
			...plan.unassignable.map((u) => String(u.order._id)),
			...plan.groups.filter((g) => !g.rider).flatMap((g) => g.entries.map((e) => String(e.order._id))),
		]);
		const blockedByCoverage = new Set(
			[...map.entries()].filter(([, v]) => v.state !== COVERAGE.COVERED).map(([k]) => k)
		);
		expect([...blockedByCoverage].sort()).toEqual([...blockedByPlan].sort());
	});
});
