/**
 * Automatic driver assignment, triggered by the order's own lifecycle.
 *
 * The moment an order becomes "ready for pickup" — however it got there: staff
 * entering a shelf number, a status change, or the scanner app finishing a pick
 * session — a driver is attached to it based on the zone covering the customer.
 * There is no manual assignment step.
 *
 * TENANCY. Every store runs its own delivery operation, and this respects that
 * boundary absolutely: a main-store order can only ever reach a main-store
 * driver, and a market's order can only ever reach that market's own drivers,
 * matched against that market's own zones. The tenant is read off the order
 * itself (`order.market`), so no caller can accidentally cross the line by
 * passing the wrong scope. Market drivers are ordinary Rider documents carrying
 * a `market` — the same model, the same zones, just a different pool.
 *
 * This lives in a service rather than in one controller because "ready for
 * pickup" is reachable from several endpoints, and an order that slipped in
 * through a path that forgot to call this would silently sit unassigned
 * forever. Every writer of that status calls exactly this function.
 *
 * DISPATCH. Attaching a driver also moves the order to "OnTheWay". There is no
 * step in between for a human to press: an order that has a driver is on its
 * way. Anything that could not be assigned right now is picked up later by the
 * background sweep (startAutoAssignScheduler) — the instant a driver comes on
 * shift or a zone is drawn, the backlog drains by itself.
 *
 * autoAssignDriverForOrder MUTATES the passed order document and leaves saving
 * to the caller — most call sites are already inside a save, and a second save
 * here would race with theirs. Call sites that persist via findOneAndUpdate and
 * have no pending save should use autoAssignAndSave().
 */

const mongoose = require("mongoose");
const Order = require("../models/Order");
const Rider = require("../models/Rider");
const Zone = require("../models/Zone");
const {
	COVERAGE,
	resolveOrderPoint,
	zoneForPoint,
	eligibleRiders,
	driversForZone,
	riderName,
} = require("../utils/autoAssign");
const { riderCoversOrder, riderDistanceToPoint } = require("../utils/zoneGeo");

const READY_FOR_PICKUP = "ready for pickup";
const ON_THE_WAY = "OnTheWay";

/**
 * Mongo filter selecting one tenant's zones/drivers/orders.
 *
 * The ObjectId cast is not cosmetic: Rider.getRidersWithStats() feeds this
 * straight into an aggregation `$match`, and aggregation does not cast strings
 * to ObjectIds the way a normal query does. A string market id there silently
 * matches nothing, which would look exactly like "this market has no drivers".
 *
 * @param {string|import('mongoose').Types.ObjectId|null} marketId
 *   null/undefined selects the main store, whose documents have no market.
 */
const tenantFilter = (marketId) =>
	marketId
		? { market: new mongoose.Types.ObjectId(String(marketId)) }
		: { $or: [{ market: null }, { market: { $exists: false } }] };

/** Outcomes, so callers can branch without matching on prose. */
const RESULT = {
	ASSIGNED: "assigned",
	ALREADY_ASSIGNED: "already-assigned",
	NOT_READY: "not-ready",
	NO_LOCATION: COVERAGE.NO_LOCATION,
	NO_ZONE: COVERAGE.NO_ZONE,
	NO_DRIVER: COVERAGE.NO_DRIVER,
};

/**
 * Rank candidate drivers for one order. Identical ordering to the batch
 * planner in utils/autoAssign.js:
 *   1. dedication — a driver covering only this zone beats a floater
 *   2. live load  — fewest orders currently in hand
 *   3. proximity  — nearest to the drop-off
 */
const rankCandidates = (candidates, zoneDocs, point) => {
	const score = (rider) => ({
		specialisation: (Array.isArray(rider.zones) ? rider.zones : []).length,
		load: Number(rider.activeOrdersCount) || 0,
		distance: riderDistanceToPoint(rider, zoneDocs, point.lat, point.lng),
		name: riderName(rider),
	});
	return [...candidates].sort((a, b) => {
		const sa = score(a);
		const sb = score(b);
		if (sa.specialisation !== sb.specialisation) return sa.specialisation - sb.specialisation;
		if (sa.load !== sb.load) return sa.load - sb.load;
		if (sa.distance !== sb.distance) return sa.distance - sb.distance;
		return sa.name.localeCompare(sb.name);
	});
};

/**
 * Attach the best available driver to an order that has just become ready for
 * pickup. Safe to call unconditionally and repeatedly: it is a no-op for orders
 * in any other state, for market orders, and for orders that already have a
 * driver.
 *
 * On success the order also moves to "OnTheWay": a driver is responsible for it
 * and it is out for delivery. Callers should notify the customer using the
 * order's FINAL status rather than the one they requested.
 *
 * @param {object} order   Mongoose Order document (mutated, not saved).
 * @param {object} [opts]
 * @param {string} [opts.actorId] User to record as updatedBy when assigning.
 * @returns {Promise<{state: string, assigned: boolean, riderId?: any,
 *   riderName?: string, zoneName?: string|null, message: string|null}>}
 */
async function autoAssignDriverForOrder(order, opts = {}) {
	const done = (state, message, extra = {}) => ({
		state,
		assigned: state === RESULT.ASSIGNED,
		message: message || null,
		...extra,
	});

	if (!order) return done(RESULT.NOT_READY, null);
	if (order.status !== READY_FOR_PICKUP) return done(RESULT.NOT_READY, null);
	if (order.assignedRider) return done(RESULT.ALREADY_ASSIGNED, null);

	// The order decides its own tenant. A market's order is matched against that
	// market's zones and drivers; a main-store order against the main store's.
	const scope = tenantFilter(order.market);
	const marketId = order.market || null;

	const point = resolveOrderPoint(order);
	if (!point) {
		return done(
			RESULT.NO_LOCATION,
			"No driver assigned: this order has no delivery pin and no recognisable city, so it cannot be matched to a delivery zone.",
		);
	}

	const zoneDocs = await Zone.find({ isActive: true, ...scope }).lean();
	const zone = zoneForPoint(zoneDocs, point.lat, point.lng);
	if (!zone) {
		const city = (order.customer && order.customer.address && order.customer.address.city) || "";
		return done(
			RESULT.NO_ZONE,
			`No driver assigned: this customer's location${city ? ` (${city})` : ""} is outside every active delivery zone.`,
			{ zoneName: null },
		);
	}

	const riders = await Rider.getRidersWithStats(scope);
	const candidates = driversForZone(eligibleRiders(riders), zone.zoneName);
	if (!candidates.length) {
		return done(
			RESULT.NO_DRIVER,
			`No driver assigned: this customer's zone "${zone.zoneName}" is not covered by any available driver.`,
			{ zoneName: zone.zoneName },
		);
	}

	// Walk the ranking and take the first driver who also passes the hard
	// coverage check, rather than trusting the ranking alone — the zone match
	// above and riderCoversOrder can legitimately disagree when a driver's own
	// zone list has been edited since the zones were drawn.
	for (const candidate of rankCandidates(candidates, zoneDocs, point)) {
		const riderDoc = await Rider.findOne({
			_id: candidate._id,
			...scope,
		}).select("zones currentLocation market");
		if (!riderDoc) continue;
		const { covers } = await riderCoversOrder(
			riderDoc,
			order,
			Zone,
			marketId || undefined,
		);
		if (!covers) continue;

		order.assignedRider = riderDoc._id;
		order.riderAssignedAt = new Date();
		// Having a driver IS being on the way — there is no button between the
		// two, so the status moves with the assignment.
		order.status = ON_THE_WAY;
		if (opts.actorId) order.updatedBy = opts.actorId;

		return done(RESULT.ASSIGNED, null, {
			riderId: riderDoc._id,
			riderName: riderName(candidate),
			zoneName: zone.zoneName,
			dispatched: true,
		});
	}

	return done(
		RESULT.NO_DRIVER,
		`No driver assigned: no driver for zone "${zone.zoneName}" currently covers this customer's exact location.`,
		{ zoneName: zone.zoneName },
	);
}

/**
 * autoAssignDriverForOrder for call sites that persist with findOneAndUpdate and
 * so have no pending save to piggyback on. Saves only when a driver was
 * actually attached, so a no-op assignment costs no extra write.
 */
async function autoAssignAndSave(order, opts = {}) {
	const result = await autoAssignDriverForOrder(order, opts);
	if (result.assigned) await order.save();
	return result;
}

/**
 * Mongo filter for "waiting on a driver" within one tenant.
 */
const backlogFilter = (marketId, orderIds) => {
	const filter = {
		isActive: true,
		status: READY_FOR_PICKUP,
		$and: [
			{ $or: [{ assignedRider: null }, { assignedRider: { $exists: false } }] },
			tenantFilter(marketId),
		],
	};
	if (Array.isArray(orderIds) && orderIds.length) {
		filter._id = { $in: orderIds };
	}
	return filter;
};

/**
 * Plan — and unless dryRun, apply — assignment for every order in one tenant
 * that is still waiting on a driver.
 *
 * This uses the zone-grouping planner rather than assigning each order on its
 * own, because a backlog is exactly where the difference shows: the planner
 * hands each ZONE to its own driver, so a batch of Zone A and Zone B orders
 * ends up split between driver A and driver B instead of piled onto whichever
 * driver happens to rank first for both.
 *
 * @param {string|import('mongoose').Types.ObjectId|null} marketId
 * @param {object} [opts]
 * @param {boolean} [opts.dryRun]  Build the plan, change nothing.
 * @param {string[]} [opts.orderIds] Restrict to these orders.
 * @param {string} [opts.actorId] Recorded as updatedBy.
 * @param {(order: object) => void} [opts.onDispatched] Called after each order
 *   is saved, so callers can notify the customer without this service reaching
 *   into the notification stack itself.
 */
async function assignTenantBacklog(marketId, opts = {}) {
	const { dryRun = false, orderIds, actorId, onDispatched } = opts;
	const scope = tenantFilter(marketId);

	const orders = await Order.find(backlogFilter(marketId, orderIds))
		.select("orderNumber customer status market total createdAt")
		.sort({ createdAt: 1 })
		.lean();

	const [zoneDocs, riders] = await Promise.all([
		Zone.find({ isActive: true, ...scope }).lean(),
		Rider.getRidersWithStats(scope),
	]);

	const { planAssignments } = require("../utils/autoAssign");
	const { groups, unassignable } = planAssignments({ orders, riders, zoneDocs });

	const describe = (o) => ({
		_id: o._id,
		orderNumber: o.orderNumber,
		customerName: (o.customer && o.customer.name) || "",
		city: (o.customer && o.customer.address && o.customer.address.city) || "",
		total: o.total,
	});

	const plan = {
		zones: groups.map((g) => ({
			zoneName: g.zoneName,
			zoneId: g.zone && g.zone._id,
			orderCount: g.entries.length,
			orders: g.entries.map((e) => describe(e.order)),
			rider: g.rider
				? {
						_id: g.rider._id,
						name: riderName(g.rider),
						zones: g.rider.zones || [],
						status: g.rider.status,
						activeOrdersCount: g.rider.activeOrdersCount || 0,
					}
				: null,
			note: g.reason || null,
			candidateCount: g.candidates.length,
		})),
		unassignable: unassignable.map((u) => ({ ...describe(u.order), reason: u.reason })),
		totals: {
			ordersConsidered: orders.length,
			zonesMatched: groups.filter((g) => g.rider).length,
			ordersPlanned: groups.filter((g) => g.rider).reduce((n, g) => n + g.entries.length, 0),
			ordersUnassignable:
				unassignable.length +
				groups.filter((g) => !g.rider).reduce((n, g) => n + g.entries.length, 0),
		},
	};

	if (dryRun) return { plan, assigned: [], failed: [] };

	const assigned = [];
	const failed = [];
	const assignedAt = new Date();

	for (const group of groups) {
		if (!group.rider) continue;
		const riderDoc = await Rider.findOne({ _id: group.rider._id, ...scope }).select(
			"zones currentLocation market",
		);
		if (!riderDoc) {
			group.entries.forEach((e) =>
				failed.push({ ...describe(e.order), reason: "Driver no longer exists" }),
			);
			continue;
		}

		for (const entry of group.entries) {
			try {
				const order = await Order.findById(entry.order._id);
				// Re-check against the live document: the on-transition trigger or a
				// concurrent sweep may already have taken this one.
				if (!order || order.status !== READY_FOR_PICKUP || order.assignedRider) {
					failed.push({ ...describe(entry.order), reason: "Already handled — skipped" });
					continue;
				}
				const { covers, reason } = await riderCoversOrder(
					riderDoc,
					order,
					Zone,
					marketId || undefined,
				);
				if (!covers) {
					failed.push({
						...describe(entry.order),
						reason: reason || "Driver's zone does not cover this order",
					});
					continue;
				}

				order.assignedRider = riderDoc._id;
				order.riderAssignedAt = assignedAt;
				order.status = ON_THE_WAY;
				if (actorId) order.updatedBy = actorId;
				await order.save();

				assigned.push({
					...describe(entry.order),
					zoneName: group.zoneName,
					riderId: riderDoc._id,
					riderName: riderName(group.rider),
				});
				if (typeof onDispatched === "function") onDispatched(order);
			} catch (err) {
				console.error("assignTenantBacklog: order failed", entry.order._id, err);
				failed.push({ ...describe(entry.order), reason: err.message || "Assignment failed" });
			}
		}
	}

	return { plan, assigned, failed };
}

/**
 * Every tenant that currently has an order waiting on a driver. Derived from the
 * orders themselves rather than from the market list, so a sweep costs nothing
 * for the (many) markets with no pending work.
 */
async function tenantsWithBacklog() {
	const markets = await Order.distinct("market", {
		isActive: true,
		status: READY_FOR_PICKUP,
		$or: [{ assignedRider: null }, { assignedRider: { $exists: false } }],
	});
	// distinct() returns null for main-store orders, which is exactly the value
	// tenantFilter() treats as "the main store".
	return markets.map((m) => m || null);
}

module.exports = {
	READY_FOR_PICKUP,
	ON_THE_WAY,
	RESULT,
	tenantFilter,
	backlogFilter,
	autoAssignDriverForOrder,
	autoAssignAndSave,
	assignTenantBacklog,
	tenantsWithBacklog,
};
