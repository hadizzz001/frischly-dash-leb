/**
 * Small geo helpers used to determine whether a rider's delivery region(s)
 * cover a given point (e.g. a customer's city). Kept dependency-free
 * (no external geo library) — just the standard haversine formula.
 */

const EARTH_RADIUS_KM = 6371;

function toRad(deg) {
	return (deg * Math.PI) / 180;
}

/**
 * Distance in kilometers between two lat/lng points.
 */
function haversineDistanceKm(lat1, lon1, lat2, lon2) {
	if (
		typeof lat1 !== "number" ||
		typeof lon1 !== "number" ||
		typeof lat2 !== "number" ||
		typeof lon2 !== "number" ||
		Number.isNaN(lat1) ||
		Number.isNaN(lon1) ||
		Number.isNaN(lat2) ||
		Number.isNaN(lon2)
	) {
		return Infinity;
	}
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(toRad(lat1)) *
			Math.cos(toRad(lat2)) *
			Math.sin(dLon / 2) *
			Math.sin(dLon / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return EARTH_RADIUS_KM * c;
}

/**
 * Does a point (lat/lng) fall inside ANY of the given delivery regions?
 * Each region: { latitude, longitude, radiusKm }.
 */
function pointInAnyRegion(lat, lng, regions) {
	if (!Array.isArray(regions) || !regions.length) return false;
	if (typeof lat !== "number" || typeof lng !== "number") return false;
	return regions.some((region) => {
		if (
			!region ||
			typeof region.latitude !== "number" ||
			typeof region.longitude !== "number" ||
			typeof region.radiusKm !== "number" ||
			region.radiusKm <= 0
		) {
			return false;
		}
		const distance = haversineDistanceKm(
			lat,
			lng,
			region.latitude,
			region.longitude
		);
		return distance <= region.radiusKm;
	});
}

module.exports = { haversineDistanceKm, pointInAnyRegion, EARTH_RADIUS_KM };
