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
 * Does this zone have usable geofence geometry (a map pin + positive radius)?
 * Zones created without picking a location on the map cannot be enforced
 * geographically — they must be treated as "covers everywhere" rather than
 * "covers nowhere", otherwise every driver in such a zone becomes
 * permanently unassignable.
 */
function zoneHasGeometry(zone) {
	return !!(
		zone &&
		zone.coordinates &&
		typeof zone.coordinates.latitude === "number" &&
		typeof zone.coordinates.longitude === "number" &&
		zoneRadiusKm(zone) > 0
	);
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
			// A named zone with no map pin/radius cannot be geo-enforced — it
			// grants coverage rather than silently blocking every assignment.
			(!zoneHasGeometry(zone) || zoneCoversPoint(zone, lat, lng))
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

	// A driver always inherits the FULL zone coverage of their tenant — the
	// market they belong to (market drivers) or the main store's global zones
	// (Frischly drivers). So we check the driver's own zones first, and if
	// those don't cover the point, we fall back to ALL of the tenant's active
	// zones. This means: if the market/store can deliver there, any of its
	// drivers can be assigned — the driver's personal zone list can only
	// EXTEND coverage, never shrink it below the tenant's.
	const tenantFilter = { isActive: true, market: marketId || null };
	const tenantZoneDocs = await ZoneModel.find(tenantFilter).lean();

	if (!tenantZoneDocs.length && !zoneNames.length) {
		// No zones configured anywhere for this tenant — nothing to enforce.
		return { covers: true, reason: null };
	}

	// Tenant-wide coverage (the market's own zones).
	const tenantNames = tenantZoneDocs.map((z) => z.zoneName);
	if (namedZonesCoverPoint(tenantNames, tenantZoneDocs, lat, lng)) {
		return { covers: true, reason: null };
	}

	// Fall back to the driver's own (possibly cross-tenant-named) zones.
	if (zoneNames.length) {
		const query = { zoneName: { $in: zoneNames }, isActive: true };
		if (marketId) query.market = marketId;
		const zoneDocs = await ZoneModel.find(query).lean();
		if (namedZonesCoverPoint(zoneNames, zoneDocs, lat, lng)) {
			return { covers: true, reason: null };
		}
	}

	return {
		covers: false,
		reason:
			"This driver's delivery zone does not cover the customer's delivery location",
	};
}

module.exports = {
	zoneCoversPoint,
	zoneHasGeometry,
	namedZonesCoverPoint,
	zoneRadiusKm,
	riderDistanceToPoint,
	riderCoversOrder,
};
