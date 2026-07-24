/**
 * Resolves whether a set of zone names (as selected on a rider/driver
 * profile) provide delivery coverage for a given lat/lng point. Coverage is
 * defined by the Zone documents themselves: each Zone has a map pin
 * (coordinates.latitude/longitude) and a radius (distance, in km or miles).
 *
 * This keeps the "delivery region" geofencing configuration in ONE place —
 * the Zones management page — instead of duplicating pin+radius pickers on
 * every driver's profile.
 */

const { haversineDistanceKm } = require("./geo");

const MILES_TO_KM = 1.60934;

function zoneRadiusKm(zone) {
	if (!zone || typeof zone.distance !== "number") return 0;
	return zone.distanceUnit === "miles" ? zone.distance * MILES_TO_KM : zone.distance;
}

/**
 * Does this single zone document's pin+radius cover the given point?
 */
function zoneCoversPoint(zone, lat, lng) {
	if (
		!zone ||
		!zone.coordinates ||
		typeof zone.coordinates.latitude !== "number" ||
		typeof zone.coordinates.longitude !== "number"
	) {
		return false;
	}
	const radiusKm = zoneRadiusKm(zone);
	if (!radiusKm || radiusKm <= 0) return false;
	const dist = haversineDistanceKm(
		lat,
		lng,
		zone.coordinates.latitude,
		zone.coordinates.longitude
	);
	return dist <= radiusKm;
}

/**
 * Given a list of zone name strings (case-insensitive) and the full list of
 * candidate Zone documents (already scoped to the right market/global
 * tenant), does ANY of the named zones cover the point?
 */
function namedZonesCoverPoint(zoneNames, zoneDocs, lat, lng) {
	if (!Array.isArray(zoneNames) || !zoneNames.length) return false;
	if (!Array.isArray(zoneDocs) || !zoneDocs.length) return false;
	const wanted = new Set(zoneNames.map((z) => String(z).toLowerCase()));
	return zoneDocs.some(
		(zone) =>
			wanted.has(String(zone.zoneName).toLowerCase()) &&
			zoneCoversPoint(zone, lat, lng)
	);
}

/**
 * Estimates how far a rider currently is from a target point (e.g. an
 * order's delivery city), used to rank "Assign Driver" dropdowns by
 * proximity (nearest driver first):
 *  - If the rider has a live GPS fix (`currentLocation`), use that — it's
 *    the most accurate signal of where the driver actually is right now.
 *  - Otherwise, fall back to the center of whichever of the rider's covering
 *    zones is closest to the point (each Zone has a map pin + radius
 *    configured on the Zones management page).
 * Returns Infinity if no usable location can be determined.
 */
function riderDistanceToPoint(rider, zoneDocs, lat, lng) {
	if (
		rider &&
		rider.currentLocation &&
		typeof rider.currentLocation.latitude === "number" &&
		typeof rider.currentLocation.longitude === "number"
	) {
		return haversineDistanceKm(
			lat,
			lng,
			rider.currentLocation.latitude,
			rider.currentLocation.longitude
		);
	}

	const riderZones = Array.isArray(rider && rider.zones) ? rider.zones : [];
	if (!riderZones.length || !Array.isArray(zoneDocs) || !zoneDocs.length) {
		return Infinity;
	}
	const wanted = new Set(riderZones.map((z) => String(z).toLowerCase()));
	let nearest = Infinity;
	for (const zone of zoneDocs) {
		if (!wanted.has(String(zone.zoneName).toLowerCase())) continue;
		if (
			!zone.coordinates ||
			typeof zone.coordinates.latitude !== "number" ||
			typeof zone.coordinates.longitude !== "number"
		) {
			continue;
		}
		const d = haversineDistanceKm(
			lat,
			lng,
			zone.coordinates.latitude,
			zone.coordinates.longitude
		);
		if (d < nearest) nearest = d;
	}
	return nearest;
}

/**
 * Hard-enforcement check used when actually ASSIGNING a driver to an order
 * (as opposed to merely filtering the "Assign Driver" dropdown list). Given
 * a Rider document and an Order document, determines whether the rider's
 * configured zone(s) cover the customer's delivery location — preferring
 * the customer's exact map pin (order.customer.address.location) and
 * falling back to the delivery city's approximate center if no exact pin
 * was captured.
 *
 * Returns { covers: boolean, reason: string|null }. If no location
 * information can be determined at all (no pin AND no recognizable city),
 * coverage cannot be enforced, so it's treated as `covers: true` — we never
 * want to hard-block an assignment just because of missing/legacy data.
 *
 * @param {object} rider - Rider document (or plain object) with `zones` array.
 * @param {object} order - Order document (or plain object) with `customer.address`.
 * @param {import('mongoose').Model} ZoneModel - the Zone mongoose model.
 * @param {string|import('mongoose').Types.ObjectId} [marketId] - if provided,
 *   scopes the Zone lookup to that market (market-admin drivers); omit for
 *   global/main-admin riders.
 */
async function riderCoversOrder(rider, order, ZoneModel, marketId) {
	if (!rider) {
		return { covers: false, reason: "Rider not found" };
	}

	const addr = (order && order.customer && order.customer.address) || {};
	const loc = addr.location;
	let lat, lng;
	if (
		loc &&
		typeof loc.latitude === "number" &&
		typeof loc.longitude === "number"
	) {
		lat = loc.latitude;
		lng = loc.longitude;
	} else if (addr.city) {
		const { getCityCoords } = require("./lebaneseCities");
		const coords = getCityCoords(addr.city);
		if (coords) {
			lat = coords.lat;
			lng = coords.lng;
		}
	}

	if (typeof lat !== "number" || typeof lng !== "number") {
		// No usable location data on the order at all — can't enforce coverage.
		return { covers: true, reason: null };
	}

	const zoneNames = Array.isArray(rider.zones) ? rider.zones : [];
	if (!zoneNames.length) {
		return {
			covers: false,
			reason: "This driver has no delivery zones configured",
		};
	}

	const query = { zoneName: { $in: zoneNames }, isActive: true };
	if (marketId) query.market = marketId;
	const zoneDocs = await ZoneModel.find(query).lean();

	const covers = namedZonesCoverPoint(zoneNames, zoneDocs, lat, lng);
	return {
		covers,
		reason: covers
			? null
			: "This driver's delivery zone does not cover the customer's delivery location",
	};
}

module.exports = {
	zoneCoversPoint,
	namedZonesCoverPoint,
	zoneRadiusKm,
	riderDistanceToPoint,
	riderCoversOrder,
};
