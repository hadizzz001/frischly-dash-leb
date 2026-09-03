/**
 * Automatic, zone-aware driver assignment.
 *
 * The rule this implements, in the operator's words: "all the Zone A orders go
 * to driver A, all the Zone B orders go to driver B". Concretely —
 *
 *   1. Each order is placed in exactly ONE zone, chosen from the same Zone
 *      documents (map pin + radius) the Zones page already configures.
 *   2. Zones are matched to drivers so that, wherever possible, no driver is
 *      handed two zones while another zone goes unstaffed.
 *   3. Everything that cannot be assigned is reported with a reason rather
 *      than silently dropped.
 *
 * This module is deliberately pure — no database, no HTTP. It takes plain
 * orders/riders/zones and returns a plan, so the matching can be reasoned
 * about and tested on its own.
 */

const {
	zoneCoversPoint,
	zoneHasGeometry,
	zoneRadiusKm,
	riderDistanceToPoint,
} = require("./zoneGeo");
const { getCityCoords } = require("./lebaneseCities");

// A driver on break or offline is not a candidate. "busy" stays eligible —
// drivers routinely carry several orders on one run, and excluding them would
// leave a zone unstaffed the moment its only driver picks up a single order.
const ASSIGNABLE_RIDER_STATUSES = new Set(["available", "busy"]);

const riderName = (rider) =>
	(rider && rider.userInfo && rider.userInfo.name) ||
	(rider && rider.name) ||
	"Driver";

const lower = (v) => String(v == null ? "" : v).toLowerCase();

/**
 * Where an order is being delivered. Prefers the customer's exact map pin and
 * falls back to the delivery city's approximate centre — the same precedence
 * the manual "Assign Driver" dropdown uses.
 * @returns {{lat: number, lng: number, source: "pin"|"city"}|null}
 */
const resolveOrderPoint = (order) => {
	const addr = (order && order.customer && order.customer.address) || {};
	const loc = addr.location;
	if (
		loc &&
		typeof loc.latitude === "number" &&
		typeof loc.longitude === "number"
	) {
		return { lat: loc.latitude, lng: loc.longitude, source: "pin" };
	}
	if (addr.city) {
		const coords = getCityCoords(addr.city);
		if (coords) return { lat: coords.lat, lng: coords.lng, source: "city" };
	}
	return null;
};

/**
 * The single zone an order belongs to. Overlapping zones are normal (a small
 * neighbourhood circle inside a big city circle), so the TIGHTEST covering
 * circle wins — that is the most specific statement about where the order is.
 * Zones with no pin/radius are skipped: they cannot place anything.
 */
const zoneForPoint = (zoneDocs, lat, lng) => {
	const covering = (zoneDocs || []).filter(
		(z) => zoneHasGeometry(z) && zoneCoversPoint(z, lat, lng),
	);
	if (!covering.length) return null;
	return covering.sort((a, b) => {
		const ra = zoneRadiusKm(a);
		const rb = zoneRadiusKm(b);
		if (ra !== rb) return ra - rb;
		const pa = Number(a.priority) || 0;
		const pb = Number(b.priority) || 0;
		if (pa !== pb) return pb - pa;
		return String(a.zoneName).localeCompare(String(b.zoneName));
	})[0];
};

/**
 * Drivers that can be given work right now. A driver on break or offline is
 * out; "busy" stays in, because drivers routinely carry several orders on one
 * run and excluding them would unstaff a zone the moment its only driver picks
 * up a single order.
 */
const eligibleRiders = (riders) =>
	(riders || []).filter(
		(r) =>
			r &&
			r.isActive !== false &&
			ASSIGNABLE_RIDER_STATUSES.has(lower(r.status || "available")),
	);

/** Eligible drivers who list `zoneName` among the zones they cover. */
const driversForZone = (riders, zoneName) =>
	riders.filter((r) =>
		(Array.isArray(r.zones) ? r.zones : []).some(
			(z) => lower(z) === lower(zoneName),
		),
	);

const centroidOf = (points) => {
	if (!points.length) return null;
	const sum = points.reduce(
		(acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
		{ lat: 0, lng: 0 },
	);
	return { lat: sum.lat / points.length, lng: sum.lng / points.length };
};

/**
 * Build the assignment plan.
 *
 * @param {object[]} orders   Orders awaiting a driver.
 * @param {object[]} riders   Candidate drivers (already tenant-scoped), each
 *   with `zones`, `status`, `activeOrdersCount` and optionally `currentLocation`.
 * @param {object[]} zoneDocs Active Zone documents for the same tenant.
 * @returns {{groups: object[], unassignable: object[]}}
 *   `groups` is one entry per zone that had orders: { zoneName, orders, rider,
 *   candidates, reason }. `rider` is null when the zone has no eligible driver,
 *   and `reason` then says why. `unassignable` lists orders that never reached
 *   a zone at all.
 */
const planAssignments = ({ orders = [], riders = [], zoneDocs = [] }) => {
	const buckets = new Map();
	const unassignable = [];

	orders.forEach((order) => {
		const point = resolveOrderPoint(order);
		if (!point) {
			unassignable.push({
				order,
				reason:
					"No delivery pin and no recognisable city on this order — nothing to match a zone against",
			});
			return;
		}
		const zone = zoneForPoint(zoneDocs, point.lat, point.lng);
		if (!zone) {
			const where =
				point.source === "city"
					? ` (matched from the city "${(order.customer &&
							order.customer.address &&
							order.customer.address.city) ||
							"?"}", which has no exact pin)`
					: "";
			unassignable.push({
				order,
				reason: `No active delivery zone covers this location${where}`,
			});
			return;
		}
		const key = lower(zone.zoneName);
		if (!buckets.has(key)) {
			buckets.set(key, { zone, zoneName: zone.zoneName, entries: [] });
		}
		buckets.get(key).entries.push({ order, point });
	});

	const eligible = eligibleRiders(riders);

	const groups = [...buckets.values()].map((bucket) => ({
		...bucket,
		candidates: driversForZone(eligible, bucket.zoneName),
	}));

	// Most-constrained zone first. A zone with a single possible driver must
	// claim them before a zone with five choices does, otherwise the greedy pick
	// strands it — this ordering is what makes "A→driver A, B→driver B" hold
	// instead of one driver absorbing both zones.
	const byConstraint = [...groups].sort((a, b) => {
		if (a.candidates.length !== b.candidates.length) {
			return a.candidates.length - b.candidates.length;
		}
		if (a.entries.length !== b.entries.length) {
			return b.entries.length - a.entries.length;
		}
		return String(a.zoneName).localeCompare(String(b.zoneName));
	});

	// riderId -> orders already handed to them by THIS plan, so a driver who has
	// to cover a second zone is still ranked on their true resulting workload.
	const assignedLoad = new Map();

	byConstraint.forEach((group) => {
		if (!group.candidates.length) {
			group.rider = null;
			group.reason = `No active driver lists "${group.zoneName}" in their zones`;
			return;
		}

		const centre = centroidOf(group.entries.map((e) => e.point));
		const score = (rider) => ({
			// A driver who covers only this zone is its dedicated driver; one who
			// covers six zones is a floater. Dedicated drivers win — this is the
			// "zone A belongs to driver A" signal, and it is the primary key.
			specialisation: (Array.isArray(rider.zones) ? rider.zones : []).length,
			load:
				(Number(rider.activeOrdersCount) || 0) +
				(assignedLoad.get(String(rider._id)) || 0),
			distance: centre
				? riderDistanceToPoint(rider, zoneDocs, centre.lat, centre.lng)
				: Infinity,
			name: riderName(rider),
		});

		const compare = (a, b) => {
			const sa = score(a);
			const sb = score(b);
			if (sa.specialisation !== sb.specialisation) {
				return sa.specialisation - sb.specialisation;
			}
			if (sa.load !== sb.load) return sa.load - sb.load;
			if (sa.distance !== sb.distance) return sa.distance - sb.distance;
			return sa.name.localeCompare(sb.name);
		};

		// Prefer a driver no other zone has taken yet; only double up a driver
		// when this zone has no untaken candidate left.
		const untaken = group.candidates.filter(
			(r) => !assignedLoad.has(String(r._id)),
		);
		const pool = untaken.length ? untaken : group.candidates;
		const chosen = [...pool].sort(compare)[0];

		group.rider = chosen;
		group.reason = untaken.length
			? null
			: `Every driver for "${group.zoneName}" is already covering another zone`;
		assignedLoad.set(
			String(chosen._id),
			(assignedLoad.get(String(chosen._id)) || 0) + group.entries.length,
		);
	});

	// Present zones alphabetically; the constraint ordering above was only ever
	// about the order decisions get made in.
	groups.sort((a, b) => String(a.zoneName).localeCompare(String(b.zoneName)));

	return { groups, unassignable };
};

/**
 * Why an order cannot currently reach a driver. Kept as constants because the
 * dashboard branches on these exact strings to pick a badge.
 */
const COVERAGE = {
	COVERED: "covered",
	NO_DRIVER: "no-driver",
	NO_ZONE: "no-zone",
	NO_LOCATION: "no-location",
};

/**
 * Per-order delivery coverage, answering "will auto-assign be able to place
 * this one, and if not, why?". Deliberately built from the same
 * resolveOrderPoint / zoneForPoint / driversForZone rules planAssignments uses,
 * so the warning on an order row can never contradict what the auto-assign
 * preview says about that same order.
 *
 * @returns {Map<string, {state: string, zoneName: string|null, driverCount: number, message: string|null}>}
 *   keyed by order id as a string.
 */
const coverageForOrders = ({ orders = [], riders = [], zoneDocs = [] }) => {
	const eligible = eligibleRiders(riders);
	const result = new Map();

	orders.forEach((order) => {
		const id = String(order._id);
		const point = resolveOrderPoint(order);
		if (!point) {
			result.set(id, {
				state: COVERAGE.NO_LOCATION,
				zoneName: null,
				driverCount: 0,
				message:
					"This order has no delivery pin and no recognisable city, so it cannot be matched to a delivery zone.",
			});
			return;
		}

		const zone = zoneForPoint(zoneDocs, point.lat, point.lng);
		if (!zone) {
			const city =
				(order.customer && order.customer.address && order.customer.address.city) ||
				"";
			result.set(id, {
				state: COVERAGE.NO_ZONE,
				zoneName: null,
				driverCount: 0,
				message: `This customer's location${city ? ` (${city})` : ""} is outside every active delivery zone, so no driver can be assigned.`,
			});
			return;
		}

		const drivers = driversForZone(eligible, zone.zoneName);
		if (!drivers.length) {
			result.set(id, {
				state: COVERAGE.NO_DRIVER,
				zoneName: zone.zoneName,
				driverCount: 0,
				message: `This customer's zone "${zone.zoneName}" is not covered by any available driver. Add it to a driver's zones, or bring a driver back on shift.`,
			});
			return;
		}

		result.set(id, {
			state: COVERAGE.COVERED,
			zoneName: zone.zoneName,
			driverCount: drivers.length,
			message: null,
		});
	});

	return result;
};

module.exports = {
	ASSIGNABLE_RIDER_STATUSES,
	COVERAGE,
	resolveOrderPoint,
	zoneForPoint,
	eligibleRiders,
	driversForZone,
	planAssignments,
	coverageForOrders,
	riderName,
};
